const statsd = require('./statsd')
const githubQueue = require('./github-queue')
const _ = require('lodash')

const { getNewLockfile } = require('../lib/lockfile')
const { getLockfilePath } = require('../utils/utils')
const { getMessage } = require('../lib/get-message')

const Log = require('gk-log')
const dbs = require('../lib/dbs')

global.Promise = require('bluebird')

module.exports = async (
  {
    installationId,
    newBranch,
    branch,
    owner,
    repoName,
    repoDoc,
    message,
    transforms,
    path,
    transform,
    processLockfiles,
    commitMessageTemplates
  }
) => {
  if (!transforms) transforms = [{ transform, path, message }]
  const ghqueue = githubQueue(installationId)
  let contents = {}

  const commits = (await Promise.mapSeries(transforms, async (
    { path, transform, message, create },
    index
  ) => {
    let blob = {}
    try {
      if (contents[path]) {
        blob.content = contents[path]
      } else {
        if (path === 'README.md') {
          blob = await ghqueue.read(github => github.repos.getReadme({ owner, repo: repoName, ref: branch }))
          path = blob.path
        } else {
          blob = await ghqueue.read(github => github.repos.getContents({
            owner,
            repo: repoName,
            path,
            ref: branch
          }))
        }
      }
    } catch (e) {
      if (e.status !== 404) throw e
      if (!create) return
    }
    let oldContent
    if (contents[path]) {
      oldContent = contents[path]
    } else {
      oldContent = blob.content ? Buffer.from(blob.content, 'base64').toString() : ''
    }

    contents[path] = await transform(oldContent, path)
    if (!contents[path] || contents[path] === oldContent) return
    return { path, content: contents[path], message, index }
  })).filter(c => c)

  if (commits.length === 0) return

  /*
  After processing all the transforms and checking whether they generated any commits,
  we check each commit whether it affected a `package.json`, and generate its lockfile,
  if applicable.

  Note that there are no transforms for these commits. They are added on to the end of
  the commits array and receive an index value, but that doesn’t correspond to an index
  of the transforms array.

  Transforms array:
  ['readme', 'travis', 'package.json', 'yay/package.json']
  Commit array with lockfiles (lockfiles are in reverse order):
  ['readme', 'travis', 'package.json', 'yay/package.json', 'yay/package-lock.json', 'package-lock.json']

  */
  if (processLockfiles && repoDoc && repoDoc.files) {
    const logs = dbs.getLogsDb()
    const log = Log({ logsDb: logs, accountId: repoDoc.accountId, repoSlug: repoDoc.fullName, context: 'create-branch' })
    // we need to iterate over every changed package file, not every package file commit
    // we reverse because we want the most recent commit with the all the changes to the file (the last one)
    // we clone because we don’t actually want to do the commits backwards
    const dedupedCommits = _.uniqBy(_.clone(commits).reverse(), commit => commit.path)
    for (const commit of dedupedCommits) {
      // continue skips the current iteration but continues with the for loop as a whole
      if (!commit.path.includes('package.json')) continue
      const lockfilePath = getLockfilePath(repoDoc.files, commit.path)

      if (!lockfilePath) continue
      const versions = transforms.map(transform => {
        return {
          dependency: transform.dependency,
          version: transform.version,
          oldVersion: transform.oldVersion
        }
      })
      log.info('starting lockfile update', { lockfilePath, versions })

      const oldLockfile = await ghqueue.read(github => github.repos.getContents({ path: lockfilePath, owner, repo: repoName }))
      const oldLockfileContent = Buffer.from(oldLockfile.content, 'base64').toString()

      log.info('received existing lockfile from GitHub')

      const isNpm = lockfilePath.includes('package-lock.json')
      try {
        const { tokens, 'token-audits': tokenAudits } = await dbs() // eslint-disable-line

        /*
        This is the structure of the tokens 'model'
        _id: `${installationId}
          tokens: {
            ${repoId}: {
            npm: ${token},
            github: ${token}
          }
        }
        */
        let execTokens = ''
        try {
          const repositoryTokens = await tokens.get(installationId)

          if (repositoryTokens) {
            execTokens = JSON.stringify(repositoryTokens.tokens[repoDoc._id])
            const datetime = new Date().toISOString().substr(0, 19).replace(/[^0-9]/g, '')

            // write audit log entry to 'token-audits' db
            // log entry type: 'read'
            await tokenAudits.put({
              _id: `${installationId}:${repoDoc._id}:${datetime}:read`,
              keys: Object.keys(repositoryTokens.tokens[repoDoc._id])
            })
          }
        } catch (error) {
          log.error(`Unable to store token audit log`, { lockfilePath, error })
        }

        const { ok, contents, error } = await getNewLockfile({ packageJson: commit.content, lock: oldLockfileContent, isNpm, repositoryTokens: execTokens })
        if (ok) {
          // !ok means the old and new lockfile are the same, so we don’t make a commit
          log.info(`new lockfile contents for ${lockfilePath} received`)
          statsd.increment('lockfiles')

          const lockfileCommitMessage = getMessage(commitMessageTemplates, 'lockfileUpdate', { lockfilePath: lockfilePath })

          commits.push({
            path: lockfilePath,
            content: contents,
            message: lockfileCommitMessage,
            index: commits.length
          })
          log.info(`created lockfile commit for ${lockfilePath}`, { lockfileCommitMessage })
        } else { // ok: false
          log.info(`error building lockfile for ${lockfilePath}`, { error })
        }
      } catch (e) {
        log.error('error fetching updated lockfile from exec server', { e: e.error || e })
      }
    }
  }

  const head = await ghqueue.read(github => github.gitdata.getRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`
  }))

  const createCommits = async (sha, { path, content, message, index }) => {
    const newTree = await ghqueue.write(github => github.gitdata.createTree({
      owner,
      repo: repoName,
      base_tree: sha,
      tree: [{ path, content, mode: '100644', type: 'blob' }]
    }))

    const commit = await ghqueue.write(github => github.gitdata.createCommit({
      owner,
      repo: repoName,
      message,
      tree: newTree.sha,
      parents: [sha]
    }))
    /*
      .created is written back into the original transform which is still used
      after create-branch is called from wherever, create-initial-branch for example. So after
      create-branch returns its SHA to create-initial-branch, the latter can check whether, for
      example, travis.yml or readme.md were modified. This is then passed into create-pr or
      whatever else sends messages to humans, where we can then notify them which files were
      MODIFIED (so the key is actually a misnomer).

      ⚠️ Lockfiles only have commits, not transforms, so when they try to write back to their
      transform, they can’t, because there is none. That’s why we check whether there’s something at
      every index we want to update.
    */
    if (transforms[index]) {
      transforms[index].created = true
    }

    return commit.sha
  }

  const sha = await Promise.reduce(commits, createCommits, head.object.sha)

  try {
    await ghqueue.write(github => github.gitdata.createRef({
      owner,
      repo: repoName,
      sha,
      ref: 'refs/heads/' + newBranch
    }))
  } catch (err) {
    if (!err.message.includes('already exists')) throw err

    const branch = await ghqueue.read(github => github.repos.getBranch({
      owner,
      repo: repoName,
      branch: newBranch
    }))

    if (branch.commit.committer.type !== 'Bot') throw err

    return branch.commit.sha
  }

  statsd.increment('branches')

  return sha
}
