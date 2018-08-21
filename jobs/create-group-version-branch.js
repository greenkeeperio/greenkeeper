const _ = require('lodash')
const semver = require('semver')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const getInfos = require('../lib/get-infos')
const {getMessage, getPrTitle} = require('../lib/get-message')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')
const { createTransformFunction, getHighestPriorityDependency, generateGitHubCompareURL, hasTooManyPackageJSONs } = require('../utils/utils')
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
    version,
    oldVersion,
    oldVersionResolved,
    versions,
    group,
    monorepo
  }
) {
  // do not upgrade invalid versions
  if (!semver.validRange(oldVersion)) return

  let isMonorepo = false
  let monorepoGroupName = null
  let monorepoGroup = ''
  let relevantDependencies = []
  const groupName = Object.keys(group)[0]

  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const installation = await installations.get(accountId)
  const repository = await repositories.get(repositoryId)
  const log = Log({logsDb: logs, accountId, repoSlug: repository.fullName, context: 'create-group-version-branch'})
  log.info(`started for ${dependency} ${version}`, {dependency, version, oldVersion, oldVersionResolved})

  if (hasTooManyPackageJSONs(repository)) {
    log.warn(`exited: repository has ${Object.keys(repository.packages).length} package.json files`)
    return
  }

  // if this dependency is part of a monorepo suite that usually gets released
  // all at the same time, check if we have update info for all the other
  // modules as well. If not, stop this update, the job started by the last
  // monorepo module will then update the whole lot.
  if (await isPartOfMonorepo(dependency)) {
    isMonorepo = true
    monorepoGroupName = await getMonorepoGroupNameForPackage(dependency)
    monorepoGroup = await getMonorepoGroup(monorepoGroupName)

    relevantDependencies = monorepoGroup.filter(dep => {
      return group[groupName].packages.map((packagePath) => {
        const hasDependency = !!_.get(repository, `packages['${packagePath}'].dependencies.${dep}`)
        const hasDevDependency = !!_.get(repository, `packages['${packagePath}'].devDependencies.${dep}`)
        const hasPeerDependency = !!_.get(repository, `packages['${packagePath}'].peerDependencies.${dep}`)
        return hasDependency || hasDevDependency || hasPeerDependency
      }).filter(Boolean).length !== 0
    })

    log.info(`last of a monorepo publish, starting the full update for ${monorepoGroupName}`)
  }

  const satisfies = semver.satisfies(version, oldVersion)
  const config = getConfig(repository)

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
    log.warn(`exited: ${dependency} ${version} ignored by user config`, { config })
    return
  }
  const onlyUpdateLockfilesIfOutOfRange = _.get(config, 'lockfiles.outOfRangeUpdatesOnly') === true
  let processLockfiles = true
  if (onlyUpdateLockfilesIfOutOfRange && satisfies) processLockfiles = false

  const [owner, repo] = repository.fullName.split('/')
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)
  const { default_branch: base } = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: using default branch', {defaultBranch: base})

  let dependencyGroup, newBranch, dependencyKey
  if (isMonorepo) {
    dependencyKey = monorepoGroupName
    dependencyGroup = relevantDependencies
    newBranch = `${config.branchPrefix}${groupName}/monorepo.${monorepoGroupName}-${version}`
  } else {
    dependencyKey = dependency
    dependencyGroup = [dependency]
    newBranch = `${config.branchPrefix}${groupName}/${dependency}-${version}`
  }
  log.info(`branch name ${newBranch} created`)

  const openPR = await findOpenPR()

  async function findOpenPR () {
    const openPR = _.get(
      await repositories.query('pr_open_by_dependency_and_group', {
        key: [repositoryId, dependencyKey, groupName],
        include_docs: true
      }),
      'rows[0].doc'
    )

    if (!openPR) return false
    log.info(`database: found open PR for ${dependencyKey}`, {openPR})

    const pr = await ghqueue.read(github => github.pullRequests.get({
      owner,
      repo,
      number: openPR.number
    }))
    if (pr.state === 'open') return openPR

    await upsert(repositories, openPR._id, _.pick(pr, ['state', 'merged']))
    return false
  }

  async function createTransformsArray (monorepo) {
    return Promise.all(dependencyGroup.map(async depName => {
      return Promise.all(monorepo.map(async pkgRow => {
        const pkg = pkgRow.value
        if (!pkg.type) return
        if (_.includes(config.ignore, depName)) return
        if (_.includes(config.groups[groupName].ignore, depName)) return
        if (!_.get(repository, `packages['${pkg.filename}'].${pkg.type}.${depName}`)) return

        const transforms = []

        const commitMessageKey = !satisfies && pkg.type === 'dependencies'
          ? 'dependencyUpdate'
          : 'devDependencyUpdate'
        const commitMessageValues = { dependency: depName, version }
        let commitMessage = getMessage(config.commitMessages, commitMessageKey, commitMessageValues)

        if (!satisfies && openPR) {
          await upsert(repositories, openPR._id, {
            comments: [...(openPR.comments || []), version]
          })
          commitMessage += getMessage(config.commitMessages, 'closes', {number: openPR.number})
        }
        log.info('commit message created', {commitMessage})
        transforms.push({
          transform: createTransformFunction(pkg.type, depName, version, log),
          path: pkg.filename,
          message: commitMessage
        })
        return transforms
      }))
    }))
  }
  const transforms = _.compact(_.flattenDeep(await createTransformsArray(monorepo)))
  const lockFileCommitMessage = getMessage(config.commitMessages, 'lockfileUpdate')

  const sha = await createBranch({
    installationId,
    owner,
    repoName: repo,
    branch: base,
    newBranch,
    transforms,
    processLockfiles,
    lockFileCommitMessage
  })
  if (sha) {
    log.success(`github: branch ${newBranch} created`, {sha})
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
    log.info(`github: commented on already open PR for ${dependency} in group ${groupName}`, {openPR})
    return
  }

  const title = getPrTitle({
    version: 'groupPR',
    dependency: dependencyKey,
    group: groupName,
    prTitles: config.prTitles})

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
    log.success(`github: pull request for ${dependency} ${version} created`, {pullRequest: createdPr})
  } else {
    log.error(`github: pull request for ${dependency} ${version} could not be created`)
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
