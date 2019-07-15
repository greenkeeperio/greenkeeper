const micromatch = require('micromatch')
const _ = require('lodash')
const { join } = require('path')

const statsd = require('./statsd')
const githubQueue = require('./github-queue')

const { getNewLockfile } = require('../lib/lockfile')
const { getLockfilePath, compactArray } = require('../utils/utils')
const { getMessage } = require('../lib/get-message')
const { getGithubFile } = require('../lib/get-files')
const { getExecTokens } = require('../lib/get-exec-tokens')

const Log = require('gk-log')
const dbs = require('../lib/dbs')

global.Promise = require('bluebird')

const getCommitsFromTransforms = async (ghqueue, { transforms, owner, repoName, branch }, log) => {
  let contents = {}

  const commits = (await Promise.mapSeries(transforms, async ({ path, transform, message, create }, index) => {
    let blob = {}

    try {
      if (contents[path]) {
        blob.content = contents[path]
      } else {
        if (path === 'README.md') {
          blob = await ghqueue.read(github => github.repos.getReadme({ owner, repo: repoName, ref: branch }))
          path = blob.path
        } else {
          blob = await getGithubFile(ghqueue, { path, owner, repo: repoName, ref: branch }, log)
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
  }))
  return compactArray(commits)
}

const createLockfileCommits = async ({ commits, repoDoc, installationId, commitMessageTemplates, transforms, owner, repoName, branch }, log) => {
  const ghqueue = githubQueue(installationId)
  const lockfileCommits = []

  // we need to iterate over every changed package file, not every package file commit
  // we reverse because we want the most recent commit with the all the changes to the file (the last one)
  // we clone because we don’t actually want to do the commits backwards
  const dedupedCommits = _.uniqBy(_.clone(commits).reverse(), commit => commit.path)
  // For yarn workspaces, we have to send the updated packages object (after applying all the update commits).
  // So we need to iterate over all commits, replace all updated packages in the packages object,
  // send all of them (old and updated together) to the exec server, tell it in which directory to run
  // yarn install, and get the old yarn lock from that dir as well
  let updatedPackages = _.clone(repoDoc.packages)
  let workspaceRootsToUpdate = []
  let packageJsonPathsWithWorkspaceDefinitions = []
  const isYarn = repoDoc.files['yarn.lock'].length > 0
  if (isYarn) {
    packageJsonPathsWithWorkspaceDefinitions = Object.keys(repoDoc.packages).filter(path => {
      const packageJson = repoDoc.packages[path]
      const workspaceDefinition = packageJson.workspaces
      // either has simple workspace definition…
      if (workspaceDefinition && workspaceDefinition.length > 0) {
        return path
      }
      // or a complex definition
      if (workspaceDefinition && workspaceDefinition.packages && workspaceDefinition.packages.length > 0) {
        return path
      }
    })
  }
  const execTokens = await getExecTokens({
    installationId,
    repoDoc
  }, log)
  // all commits of a workspaceRoot
  // all commits of no workspace
  for (const commit of dedupedCommits) {
    // continue skips the current iteration but continues with the for loop as a whole
    if (!commit.path.includes('package.json')) continue
    const packageJsonPath = commit.path
    const lockfilePath = getLockfilePath(repoDoc.files, packageJsonPath)
    if (isYarn) {
      // Iterate though all workspace definitions until we find a workspace path/glob that fits our commit.path
      const workspaceRootPath = getWorkspaceRootPathForCommit({
        workspaceRootPaths: packageJsonPathsWithWorkspaceDefinitions,
        repoDoc,
        commit
      })

      if (workspaceRootPath) {
        // Record that we need to run yarn install in this directory
        if (!workspaceRootsToUpdate.includes(workspaceRootPath)) workspaceRootsToUpdate.push(workspaceRootPath)
        // Update our current packages object with this new, updated package
        updatedPackages[commit.path] = JSON.parse(commit.content)
        // skip the rest of the loop for this commit, we don’t want a lockfile per file, we’ll make a new
        // lockfile per workspace in a separate loop later
        continue
      } else {
        // if this repo has workspaces, but this package json isn’t in one, do not get a lockfile for it
        continue
      }
    }
    if (!lockfilePath) continue
    const lockfileCommit = await updateLockfile({
      transforms,
      lockfilePath,
      ghqueue,
      owner,
      repoName,
      branch,
      packageJson: commit.content,
      execTokens,
      commitMessageTemplates,
      log
    })
    if (lockfileCommit) {
      lockfileCommits.push({ ...lockfileCommit, index: commits.length + lockfileCommits.length })
    }
  } // done iterating over all commits
  // Loop through all workspaces and get a lockfile for each of them
  for (const workspaceRoot of workspaceRootsToUpdate) {
    const lockfileCommit = await updateLockfile({
      transforms,
      lockfilePath: workspaceRoot.replace('package.json', 'yarn.lock'),
      packages: updatedPackages,
      workspaceRoot,
      ghqueue,
      owner,
      repoName,
      branch,
      execTokens,
      commitMessageTemplates,
      log
    })
    if (lockfileCommit) {
      lockfileCommits.push({ ...lockfileCommit, index: commits.length + lockfileCommits.length })
    }
  }

  return lockfileCommits
}

const updateLockfile = async ({
  transforms,
  lockfilePath,
  ghqueue,
  owner,
  repoName,
  branch,
  packageJson,
  execTokens,
  commitMessageTemplates,
  packages, // optional, for yarn workspaces
  workspaceRoot, // optional, for yarn workspaces
  log
}) => {
  // Get versions for logging
  const versions = transforms.map(transform => {
    return {
      dependency: transform.dependency,
      version: transform.version,
      oldVersion: transform.oldVersion
    }
  })
  if (workspaceRoot) {
    log.info('starting yarn workspace lockfile update', { lockfilePath, workspaceRoot, versions })
  } else {
    log.info('starting single-file lockfile update', { lockfilePath, versions })
  }
  const oldLockfile = await getGithubFile(ghqueue, { path: lockfilePath, owner, repo: repoName, sha: branch }, log)
  const oldLockfileContent = Buffer.from(oldLockfile.content, 'base64').toString()

  try {
    let type = 'npm'
    if (lockfilePath.includes('pnpm-lock.yaml')) type = 'pnpm'
    if (lockfilePath.includes('yarn.lock')) type = 'yarn'
    const { ok, contents, error } = await getNewLockfile({ packageJson, packages, workspaceRoot, lock: oldLockfileContent, type, repositoryTokens: execTokens })
    if (ok) {
      // !ok means the old and new lockfile are the same, so we don’t make a commit
      log.info(`new lockfile contents for ${lockfilePath} received`)
      statsd.increment('lockfiles')

      const lockfileCommitMessage = getMessage(commitMessageTemplates, 'lockfileUpdate', { lockfilePath: lockfilePath })
      log.info(`created lockfile commit for ${lockfilePath}`, { lockfileCommitMessage })
      return {
        path: lockfilePath,
        content: contents,
        message: lockfileCommitMessage
      }
    } else { // ok: false
      log.error(`error building lockfile for ${lockfilePath}`, { error })
      return undefined
    }
  } catch (e) {
    log.error('error fetching updated lockfile from exec server', { e: e.error || e })
    return undefined
  }
}

const getWorkspaceRootPathForCommit = ({
  workspaceRootPaths: packageJsonPathsWithWorkspaceDefinitions,
  repoDoc,
  commit
}) => {
  return packageJsonPathsWithWorkspaceDefinitions.find(packageJsonPath => {
    // the workspaceRoot itself is also always part of the workspace
    if (commit.path === packageJsonPath) return true

    const rootPath = packageJsonPath.replace('package.json', '')
    // Get the packageJson with the workspace definitions
    const packageJson = repoDoc.packages[packageJsonPath]
    // Get workspace definitions, can be directly in `workspaces` or `workspaces.packages`
    // workspaceDefinitions will be sth like `[ 'jobs/*', 'docs' ]`
    const workspaceDefinitions = packageJson.workspaces && packageJson.workspaces.packages ? packageJson.workspaces.packages : packageJson.workspaces
    const matchingPaths = workspaceDefinitions.map(definition => {
      // Join the definition PJ path with the definition path to get the absolute definition paths from the repo root,
      // not the workspace root
      return join(rootPath, definition)
    })
    // Figure out whether this workspace definition includes the PJ we’re updating
    const commitPathWithoutFilename = commit.path.replace('/package.json', '')
    const isParentWorkspaceOfPackageJson = micromatch.isMatch(commitPathWithoutFilename, matchingPaths)
    return isParentWorkspaceOfPackageJson
  })
}

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

  const logs = dbs.getLogsDb()
  const log = Log({
    logsDb: logs,
    accountId: repoDoc ? repoDoc.accountId : '',
    repoSlug: repoDoc ? repoDoc.fullName : '',
    context: 'create-branch' })
  let commits = await getCommitsFromTransforms(ghqueue, { transforms, owner, repoName, branch }, log)
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
    const lockfileCommits = await createLockfileCommits(
      { commits,
        repoDoc,
        installationId,
        commitMessageTemplates,
        transforms,
        owner,
        repoName,
        branch },
      log)
    commits = [...commits, ...lockfileCommits]
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
