const statsd = require('./statsd')
const githubQueue = require('./github-queue')

const { getNewLockfile } = require('../lib/lockfile')
const { getLockfilePath } = require('../utils/utils')

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
    lockFileCommitMessage
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
          blob = await ghqueue.read(github => github.repos.getContent({
            owner,
            repo: repoName,
            path,
            ref: branch
          }))
        }
      }
    } catch (e) {
      if (e.code !== 404) throw e
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

  // check for lockfiles
  // new commits need a new index
  if (processLockfiles && repoDoc.files) {
    for (const commit of commits) {
      if (commit.path.includes('package.json')) {
        const lockfilePath = getLockfilePath(repoDoc.files, commit.path)

        if (lockfilePath) {
          const lockfile = await ghqueue.read(github => github.repos.getContent({ path: lockfilePath, owner, repo: repoName }))
          const packageFile = repoDoc.packages[commit.path]

          // send contents to exec server
          // return new lockfile, or nothing if ok: false
          // getNewLockfile(package.json, package-lock.json, isNpm)
          const isNpm = lockfilePath.includes('package-lock.json')
          const {ok, contents} = await getNewLockfile(JSON.stringify(packageFile), JSON.stringify(lockfile), isNpm)
          if (ok) {
            commits.push({
              path: lockfilePath,
              content: contents,
              message: lockFileCommitMessage,
              index: commits.length
            })
          }
        }
      }
    }
  }

  const head = await ghqueue.read(github => github.gitdata.getReference({
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

    // Lockfiles only have commits, not transforms
    if (transforms[index]) {
      transforms[index].created = true
    }

    return commit.sha
  }

  const sha = await Promise.reduce(commits, createCommits, head.object.sha)

  try {
    await ghqueue.write(github => github.gitdata.createReference({
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
