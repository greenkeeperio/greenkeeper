const _ = require('lodash')
const semver = require('semver')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const { getMessage, getPrTitle } = require('../lib/get-message')
const { getInfos, getFormattedDependencyURL } = require('../lib/get-infos')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const {
  isPartOfMonorepo,
  getMonorepoGroup,
  getMonorepoGroupNameForPackage,
  isDependencyIgnoredInGroups
} = require('../lib/monorepo')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')
const { createTransformFunction,
  generateGitHubCompareURL,
  hasTooManyPackageJSONs,
  getSatisfyingVersions,
  getOldVersionResolved
} = require('../utils/utils')

const prContent = require('../content/update-pr')

module.exports = async function (
  {
    dependency,
    accountId,
    repositoryId,
    type,
    // The following 4 don’t matter anymore, since we fetch them anew for every dependency anyway
    version,
    oldVersion,
    oldVersionResolved,
    versions,
    isFromHook
  }
) {
  // do not upgrade invalid versions
  if (!semver.validRange(oldVersion)) return
  let isMonorepo = false
  let monorepoGroupName = null
  let monorepoGroup = ''
  let relevantDependencies = []

  const { installations, repositories, npm } = await dbs()
  const logs = dbs.getLogsDb()
  const installation = await installations.get(accountId)
  const repoDoc = await repositories.get(repositoryId)
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-version-branch'})
  log.info(`started for ${dependency} ${version}`, {dependency, type, version, oldVersion})

  if (hasTooManyPackageJSONs(repoDoc)) {
    log.warn(`exited: repository has ${Object.keys(repoDoc.packages).length} package.json files`)
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
    relevantDependencies = monorepoGroup.filter(dep =>
      !!JSON.stringify(repoDoc.packages['package.json']).match(dep))

    log.info(`last of a monorepo publish, starting the full update for ${monorepoGroupName}`)
  }

  const config = getConfig(repoDoc)
  log.info(`config for ${repoDoc.fullName}`, {config})

  let billing = null
  if (!env.IS_ENTERPRISE) {
    billing = await getActiveBilling(accountId)
    if (repoDoc.private) {
      if (!billing || await getAccountNeedsMarketplaceUpgrade(accountId)) {
        log.warn('exited: payment required')
        return
      }
    }
  }

  const [owner, repo] = repoDoc.fullName.split('/')
  const installationId = installation.installation

  let group, newBranch, dependencyKey
  if (isMonorepo) {
    dependencyKey = monorepoGroupName
    group = relevantDependencies
    newBranch = `${config.branchPrefix}monorepo.${monorepoGroupName}-${version}`
  } else {
    dependencyKey = dependency
    group = [dependency]
    newBranch = `${config.branchPrefix}${dependency}-${version}`
  }
  log.info(`branch name ${newBranch} created`)

  const ghqueue = githubQueue(installationId)
  const openPR = await findOpenPR()

  let satisfiesAll = true
  async function createTransformsArray (group, json) {
    return Promise.all(group.map(async depName => {
      // Bail if the dependency is ignored in a group (yes, group configs make no sense in a non-monorepo, but we respect it anyway)
      if (config.groups && isDependencyIgnoredInGroups(config.groups, 'package.json', depName)) {
        log.warn(`exited transform creation: ${depName} ignored by groups config`, { config })
        return
      }
      // Bail if the dependency is ignored globally
      if (_.includes(config.ignore, depName)) {
        log.warn(`exited transform creation: ${depName} ignored by user config`, { config })
        return
      }

      const types = Object.keys(json).filter(type => {
        if (Object.keys(json[type]).includes(depName)) return type
      })
      if (!types.length) return
      const dependencyType = types[0]

      const oldPkgVersion = _.get(json, [dependencyType, depName])
      if (!oldPkgVersion) {
        log.warn(`exited transform creation: could not find old package version for ${depName}`, {newVersion: version, dependencyType, packageFile: _.get(json, [dependencyType])})
        return null
      }

      // get version for each dependency
      const npmDoc = await npm.get(isFromHook ? `${installationId}:${depName}` : depName)
      const latestDependencyVersion = npmDoc['distTags']['latest']
      const repoURL = _.get(npmDoc, `versions['${latestDependencyVersion}'].repository.url`)

      if (semver.ltr(latestDependencyVersion, oldPkgVersion)) { // no downgrades
        log.warn(`exited transform creation: ${depName} ${latestDependencyVersion} would be a downgrade from ${oldPkgVersion}`, {newVersion: latestDependencyVersion, oldVersion: oldPkgVersion})
        return null
      }
      const satisfies = semver.satisfies(latestDependencyVersion, oldPkgVersion)
      if (!satisfies) satisfiesAll = false
      const commitMessageKey = !satisfies && dependencyType === 'dependencies'
        ? 'dependencyUpdate'
        : 'devDependencyUpdate'
      const commitMessageValues = { dependency: depName, version: latestDependencyVersion }
      let commitMessage = getMessage(config.commitMessages, commitMessageKey, commitMessageValues)

      if (!satisfies && openPR) {
        await upsert(repositories, openPR._id, {
          comments: [...(openPR.comments || []), latestDependencyVersion]
        })
        commitMessage += getMessage(config.commitMessages, 'closes', {number: openPR.number})
      }
      log.info(`commit message for ${depName} created`, {commitMessage})

      const satisfyingVersions = getSatisfyingVersions(npmDoc.versions, {
        value: {oldVersion: oldPkgVersion}
      })
      const oldVersionResolved = getOldVersionResolved(satisfyingVersions, npmDoc.distTags, 'latest')
      if (!oldVersionResolved) {
        log.warn(`exited transform creation: could not resolve old version for ${depName} (no update?)`, {newVersion: version, json, satisfyingVersions, latestDependencyVersion, oldPkgVersion})
        return null
      }

      if (semver.prerelease(latestDependencyVersion) && !semver.prerelease(oldVersionResolved)) {
        log.info(`exited transform creation: ${depName} ${latestDependencyVersion} is a prerelease on latest and user does not use prereleases for this dependency`, {latestDependencyVersion, oldPkgVersion})
        return null
      }

      return {
        transform: createTransformFunction(dependencyType, depName, latestDependencyVersion, log),
        path: 'package.json',
        message: commitMessage,
        dependency: depName,
        oldVersion: oldVersionResolved,
        version: latestDependencyVersion,
        dependencyType,
        repoURL
      }
    }))
  }

  // If an npm-shrinkwrap.json exists, we bail if semver is satisfied
  function isTrue (x) {
    if (typeof x === 'object') {
      return !!x.length
    }
    return x
  }

  const hasModuleLockFile = repoDoc.files && isTrue(repoDoc.files['npm-shrinkwrap.json'])

  // Bail if it’s in range and the repo uses shrinkwrap
  if (satisfiesAll && hasModuleLockFile) {
    log.info(`exited: ${dependency} ${version} satisfies semver & repository has a module lockfile (shrinkwrap type)`)
    return
  }

  // Some users may want to keep the legacy behaviour where all lockfiles are only ever updated on out-of-range updates.
  const onlyUpdateLockfilesIfOutOfRange = _.get(config, 'lockfiles.outOfRangeUpdatesOnly') === true
  let processLockfiles = true
  if (onlyUpdateLockfilesIfOutOfRange && satisfiesAll) {
    log.info('exiting: user wants out-of-range lockfile updates only', {config})
    return
  }

  const transforms = _.compact(_.flatten(await createTransformsArray(group, repoDoc.packages['package.json'])))

  if (transforms.length === 0) return

  const { default_branch: base } = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: using default branch', {defaultBranch: base})

  const sha = await createBranch({
    installationId,
    owner,
    repoName: repo,
    repoDoc,
    branch: base,
    newBranch,
    path: 'package.json',
    transforms,
    processLockfiles,
    commitMessageTemplates: config.commitMessages
  })
  if (sha) {
    log.success(`github: branch ${newBranch} created`, {sha})
  }

  if (!sha) { // no branch was created
    log.error('github: no branch was created')
    return
  }

  let packageUpdateList = ''
  transforms.forEach(async transform => {
    if (transform.created) {
      const dependencyURL = getFormattedDependencyURL({repositoryURL: transform.repoURL, dependency: transform.dependency})
      packageUpdateList += `- The \`${transform.dependencyType.replace('ies', 'y')}\` [${transform.dependency}](${dependencyURL}) was updated from \`${transform.oldVersion}\` to \`${transform.version}\`.\n`
    }
  })

  // TODO: previously we checked the default_branch's status
  // this failed when users used [ci skip]
  // or the repo was freshly set up
  // the commit didn't have a status then
  // https://github.com/greenkeeperio/greenkeeper/issues/59
  // new strategy: we just don't do anything for now
  // in the future we can check at this very moment
  // how many unprocessed branches are lying around
  // and create an issue telling the user to enable CI

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
    dependencyType: type,
    repositoryId,
    accountId,
    processed: !satisfiesAll,
    packageUpdateList
  })

  // nothing to do anymore
  // the next action will be triggered by the status event
  if (satisfiesAll) {
    log.info('dependency satisfies version range, no action required')
    return
  }

  const diffBase = openPR
    ? _.get(openPR, 'comments.length')
      ? _.last(openPR.comments)
      : openPR.version
    : oldVersionResolved

  const dependencyLink = getFormattedDependencyURL({repositoryURL: transforms[0].repoURL})
  const { release, diffCommits } = await getInfos({
    installationId,
    dependency,
    monorepoGroupName,
    version,
    diffBase,
    versions
  })

  const bodyDetails = _.compact(['\n', release, diffCommits]).join('\n')

  const compareURL = generateGitHubCompareURL(repoDoc.fullName, base, newBranch)

  const commentBody = (packageUpdateList + `\n[Update to ${transforms.length === 1 ? 'this version' : 'these versions'} instead 🚀](${compareURL}) \n ${bodyDetails}`).trim()

  if (openPR) {
    await ghqueue.write(github => github.issues.createComment({
      owner,
      repo,
      number: openPR.number,
      body: commentBody
    }))

    statsd.increment('pullrequest_comments')
    log.info(`github: commented on already open PR for ${dependency}`, {openPR})
    return
  }

  const title = getPrTitle({
    version: 'basicPR',
    dependency: dependencyKey,
    prTitles: config.prTitles})

  const body = prContent({
    dependencyLink,
    oldVersionResolved,
    version,
    dependency,
    release,
    diffCommits,
    monorepoGroupName,
    type,
    packageUpdateList
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
    state: createdPr.state
  })

  if (config.label !== false) {
    await ghqueue.write(github => github.issues.addLabels({
      number: createdPr.number,
      labels: [config.label],
      owner,
      repo
    }))
  }

  async function findOpenPR () {
    const openPR = _.get(
      await repositories.query('pr_open_by_dependency', {
        key: [repositoryId, dependencyKey],
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
    log.warn('Could not create PR', { err })
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
