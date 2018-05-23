const _ = require('lodash')
const semver = require('semver')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const getInfos = require('../lib/get-infos')
const getMessage = require('../lib/get-message')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')
const { createTransformFunction, getHighestPriorityDependency, generateGitHubCompareURL } = require('../utils/utils')
const {
  isPartOfMonorepo,
  getMonorepoGroup,
  getMonorepoGroupNameForPackage
} = require('../lib/monorepo')

const prContent = require('../content/update-pr')

module.exports = async function (
  {
    dependency,
    accountId,
    repositoryId,
    types,
    distTag,
    distTags,
    oldVersion,
    oldVersionResolved,
    versions,
    group,
    monorepo
  }
) {
  // TODO: correctly handle beta versions, and hotfixes
  if (distTag !== 'latest') return
  // do not upgrade invalid versions
  if (!semver.validRange(oldVersion)) return

  let isMonorepo = false
  let monorepoGroupName = null
  let monorepoGroup = ''
  let relevantDependencies = []
  const groupName = Object.keys(group)[0]
  const version = distTags[distTag]
  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const installation = await installations.get(accountId)
  const repository = await repositories.get(repositoryId)
  const log = Log({logsDb: logs, accountId, repoSlug: repository.fullName, context: 'create-group-version-branch'})
  log.info('started', {dependency, version, oldVersion})

  // if this dependency is part of a monorepo suite that usually gets released
  // all at the same time, check if we have update info for all the other
  // modules as well. If not, stop this update, the job started by the last
  // monorepo module will then update the whole lot.
  if (await isPartOfMonorepo(dependency)) {
    isMonorepo = true
    monorepoGroupName = await getMonorepoGroupNameForPackage(dependency)
    monorepoGroup = await getMonorepoGroup(monorepoGroupName)
    relevantDependencies = monorepoGroup.filter(dep =>
      !!JSON.stringify(repository.packages['package.json']).match(dep))

    log.info(`last of a monorepo publish, starting the full update for ${monorepoGroupName}`)
  }

  const satisfies = semver.satisfies(version, oldVersion)

  // Shrinkwrap should behave differently from regular lockfiles:
  //
  // If an npm-shrinkwrap.json exists, we bail if semver is satisfied and continue
  // if not. For the other two types of lockfiles (package-lock and yarn-lock),
  // we will in future check if gk-lockfile is found in the repo’s dev-dependencies,
  // if it is, Greenkeeper will continue (and the lockfiles will get updated),
  // if not, we bail as before and nothing happens (because without gk-lockfile,
  // the CI build wouldn‘t install anything new anyway).
  //
  // Variable name explanations:
  // - moduleLogFile: Lockfiles that get published to npm and that influence what
  //   gets installed on a user’s machine, such as `npm-shrinkwrap.json`.
  // - projectLockFile: lockfiles that don’t get published to npm and have no
  //   influence on the users’ dependency trees, like package-lock and yarn-lock
  //
  // See this issue for details: https://github.com/greenkeeperio/greenkeeper/issues/506

  // const moduleLockFiles = ['npm-shrinkwrap.json']
  // const projectLockFiles = ['package-lock.json', 'yarn.lock']
  // MONOREPO: returns true if there is at least 1 lockfile in the monorepo
  // const hasModuleLockFile = _.some(_.pick(repository.files, moduleLockFiles))
  // const hasProjectLockFile = _.some(_.pick(repository.files, projectLockFiles))
  // const usesGreenkeeperLockfile = _.some(_.pick(repository.packages['package.json'].devDependencies, 'greenkeeper-lockfile'))

  // Bail if it’s in range and the repo uses shrinkwrap
  // if (satisfies && hasModuleLockFile) {
  //   log.info('exited: dependency satisfies semver & repository has a module lockfile (shrinkwrap type)')
  //   return
  // }

  // If the repo does not use greenkeeper-lockfile, there’s no point in continuing because the lockfiles
  // won’t get updated without it
  // if (satisfies && hasProjectLockFile && !usesGreenkeeperLockfile) {
  //   log.info('exited: dependency satisfies semver & repository has a project lockfile (*-lock type), and does not use gk-lockfile')
  //   return
  // }

  // Some users may want to keep the legacy behaviour where all lockfiles are only ever updated on out-of-range updates.
  const config = getConfig(repository)
  // const onlyUpdateLockfilesIfOutOfRange = _.get(config, 'lockfiles.outOfRangeUpdatesOnly') === true
  // if (satisfies && hasProjectLockFile && onlyUpdateLockfilesIfOutOfRange) {
  //   log.info('exited: dependency satisfies semver & repository has a project lockfile (*-lock type) & lockfiles.outOfRangeUpdatesOnly is true')
  //   return
  // }

  if (repository.private && !env.IS_ENTERPRISE) {
    const billing = await getActiveBilling(accountId)
    if (!billing || await getAccountNeedsMarketplaceUpgrade(accountId)) {
      log.warn('exited: payment required')
      return
    }
  }

  if (
    _.includes(config.ignore, dependency) ||
    (monorepoGroupName && _.includes(config.ignore, monorepoGroupName)) ||
    (relevantDependencies.length &&
      _.intersection(config.ignore, relevantDependencies).length === relevantDependencies.length) ||
    _.includes(config.groups[groupName].ignore, dependency) ||
    (monorepoGroupName && _.includes(config.groups[groupName].ignore, monorepoGroupName)) ||
    (relevantDependencies.length &&
      _.intersection(config.groups[groupName].ignore, relevantDependencies).length === relevantDependencies.length)
  ) {
    log.warn('exited: dependency ignored by user config')
    return
  }

  const [owner, repo] = repository.fullName.split('/')
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)
  const { default_branch: base } = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: using default branch', {defaultBranch: base})

  let dependencyGroup, newBranch, dependencyKey
  if (isMonorepo) {
    dependencyKey = monorepoGroupName
    dependencyGroup = relevantDependencies
    newBranch = `${config.branchPrefix}${groupName}/monorepo:${monorepoGroupName}-${version}`
  } else {
    dependencyKey = dependency
    dependencyGroup = [dependency]
    newBranch = `${config.branchPrefix}${groupName}/${dependency}-${version}`
  }
  log.info('branch name created', {branchName: newBranch})

  const openPR = _.get(
    await repositories.query('pr_open_by_dependency_and_group', {
      key: [repositoryId, dependencyKey, groupName],
      include_docs: true
    }),
    'rows[0].doc'
  )
  if (openPR) {
    log.info('database: found open PR for this dependency', {openPR})
  } else {
    log.info('database: no open PR for this dependency')
  }

  async function createTransformsArray (monorepo) {
    return Promise.all(dependencyGroup.map(async depName =>
      Promise.all(monorepo.map(async pkgRow => {
        const pkg = pkgRow.value
        const type = types.find(t => t.filename === pkg.filename)
        if (!type) return
        if (_.includes(config.ignore, depName)) return
        if (_.includes(config.groups[groupName].ignore, depName)) return

        const commitMessageScope = !satisfies && type.type === 'dependencies'
          ? 'fix'
          : 'chore'
        let commitMessage = `${commitMessageScope}(package): update ${depName} to version ${version}`

        if (!satisfies && openPR) {
          await upsert(repositories, openPR._id, {
            comments: [...(openPR.comments || []), version]
          })
          commitMessage += getMessage(config.commitMessages, 'closes', {number: openPR.number})
        }
        log.info('commit message created', {commitMessage})
        return {
          transform: createTransformFunction(type.type, depName, version, log),
          path: pkg.filename,
          message: commitMessage
        }
      })
    )))
  }
  const transforms = _.compact(_.flatten(await createTransformsArray(monorepo)))
  const sha = await createBranch({
    installationId,
    owner,
    repo,
    branch: base,
    newBranch,
    transforms
  })
  if (sha) {
    log.success('github: branch created', {sha})
  }

  if (!sha) { // no branch was created
    log.error('github: no branch was created')
    return
  }

  const highestPriorityDependency = getHighestPriorityDependency(types)
  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    sha,
    base,
    head: newBranch,
    dependency,
    monorepoGroupName,
    version,
    oldVersion,
    oldVersionResolved,
    dependencyType: highestPriorityDependency,
    repositoryId,
    accountId,
    processed: !satisfies,
    group: groupName
  })
  // nothing to do anymore
  // the next action will be triggered by the status event
  if (satisfies) {
    log.info('dependency satisfies version range, no action required')
    return
  }

  const diffBase = openPR
    ? _.get(openPR, 'comments.length')
        ? _.last(openPR.comments)
        : openPR.version
    : oldVersionResolved

  const { dependencyLink, release, diffCommits } = await getInfos({
    installationId,
    dependency,
    monorepoGroupName,
    version,
    diffBase,
    versions
  })

  const bodyDetails = _.compact(['\n', release, diffCommits]).join('\n')

  const compareURL = generateGitHubCompareURL(repository.fullName, base, newBranch)

  if (openPR) {
    await ghqueue.write(github => github.issues.createComment({
      owner,
      repo,
      number: openPR.number,
      body: `## Version **${version}** just got published. \n[Update to this version instead 🚀](${compareURL}) ${bodyDetails}`
    }))

    statsd.increment('pullrequest_comments')
    log.info('github: commented on already open PR for that dependency and group')
    return
  }

  const title = `Update ${dependencyKey} in group ${groupName} to the latest version 🚀`

  // maybe adapt PR body
  const body = prContent({
    dependencyLink,
    oldVersionResolved,
    version,
    dependency,
    monorepoGroupName,
    type: highestPriorityDependency,
    release,
    diffCommits
  })

  // verify pull requests commit
  await ghqueue.write(github => github.repos.createStatus({
    sha,
    owner,
    repo,
    state: 'success',
    context: 'greenkeeper/verify',
    description: 'Greenkeeper verified pull request',
    target_url: 'https://greenkeeper.io/verify.html'
  }))
  log.info('github: set greenkeeper/verify status')

  const createdPr = await createPr({
    ghqueue,
    title,
    body,
    base,
    head: newBranch,
    owner,
    repo,
    log
  })

  if (createdPr) {
    log.success('github: pull request created', {pullRequest: createdPr})
  }
  if (!createdPr) {
    log.error('github: pull request was not created')
    return
  }

  statsd.increment('update_pullrequests')

  await upsert(repositories, `${repositoryId}:pr:${createdPr.id}`, {
    type: 'pr',
    repositoryId,
    accountId,
    version,
    oldVersion,
    dependency: dependencyKey,
    initial: false,
    merged: false,
    number: createdPr.number,
    state: createdPr.state,
    group: groupName
  })

  if (config.label !== false) {
    await ghqueue.write(github => github.issues.addLabels({
      number: createdPr.number,
      labels: [config.label],
      owner,
      repo
    }))
  }
}

async function createPr ({ ghqueue, title, body, base, head, owner, repo, log }) {
  try {
    return await ghqueue.write(github => github.pullRequests.create({
      title,
      body,
      base,
      head,
      owner,
      repo
    }))
  } catch (err) {
    if (err.code !== 422) throw err
    const allPrs = await ghqueue.read(github => github.pullRequests.getAll({
      base,
      head: owner + ':' + head,
      owner,
      repo
    }))

    if (allPrs.length > 0) {
      log.warn('queue: retry sending pull request to github')
      return allPrs.shift()
    }
  }
}
