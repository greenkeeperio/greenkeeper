const _ = require('lodash')
const semver = require('semver')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const { getInfos, getFormattedDependencyURL } = require('../lib/get-infos')
const { getMessage, getPrTitle } = require('../lib/get-message')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')
const {
  createTransformFunction,
  getHighestPriorityDependency,
  generateGitHubCompareURL,
  hasTooManyPackageJSONs,
  getSatisfyingVersions,
  getOldVersionResolved
} = require('../utils/utils')
const {
  isPartOfMonorepo,
  getMonorepoGroup,
  getMonorepoGroupNameForPackage
} = require('../lib/monorepo')
const prContent = require('../content/update-pr')
const { isGatsbyPkg } = require('../lib/isGatsby')

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
    monorepo,
    isFromHook
  }
) {
  // do not upgrade invalid versions
  if (!semver.validRange(oldVersion)) return
  // TODO: delete me!
  if (isGatsbyPkg(dependency)) {
    return null
  }

  let isMonorepo = false
  let monorepoGroupName = null
  let monorepoGroup = ''
  let relevantDependencies = []
  const groupName = Object.keys(group)[0]

  const { installations, repositories, npm } = await dbs()
  const logs = dbs.getLogsDb()
  const installation = await installations.get(accountId)
  const repoDoc = await repositories.get(repositoryId)
  const log = Log({ logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-group-version-branch' })
  log.info(`started for ${dependency} ${version}`, { dependency, version, oldVersion, oldVersionResolved })

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

    relevantDependencies = monorepoGroup.filter(dep => {
      return group[groupName].packages.map((packagePath) => {
        const hasDependency = !!_.get(repoDoc, `packages['${packagePath}'].dependencies.${dep}`)
        const hasDevDependency = !!_.get(repoDoc, `packages['${packagePath}'].devDependencies.${dep}`)
        const hasPeerDependency = !!_.get(repoDoc, `packages['${packagePath}'].peerDependencies.${dep}`)
        return hasDependency || hasDevDependency || hasPeerDependency
      }).filter(Boolean).length !== 0
    })

    log.info(`last of a monorepo publish, starting the full update for ${monorepoGroupName}`)
  }

  const config = getConfig(repoDoc)

  if (repoDoc.private && !env.IS_ENTERPRISE) {
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

  const [owner, repo] = repoDoc.fullName.split('/')
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)

  let dependencyGroup, newBranch, dependencyKey
  if (isMonorepo) {
    dependencyKey = monorepoGroupName
    dependencyGroup = relevantDependencies
    const datetime = new Date().toISOString().substr(0, 19).replace(/[^0-9]/g, '')
    newBranch = `${config.branchPrefix}${groupName}/monorepo.${monorepoGroupName}-${datetime}`
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
    log.info(`database: found open PR for ${dependencyKey}`, { openPR })

    const pr = await ghqueue.read(github => github.pullRequests.get({
      owner,
      repo,
      number: openPR.number
    }))
    if (pr.state === 'open') return openPR

    await upsert(repositories, openPR._id, _.pick(pr, ['state', 'merged']))
    return false
  }

  let satisfiesAll = true
  async function createTransformsArray (monorepo) {
    return Promise.all(dependencyGroup.map(async depName => {
      // get version for each dependency
      const npmDoc = await npm.get(isFromHook ? `${installationId}:${depName}` : depName)
      const latestDependencyVersion = npmDoc['distTags']['latest']
      if (!semver.valid(latestDependencyVersion)) {
        log.warn(`exited transform creation: ${depName} latestDependencyVersion: ${latestDependencyVersion} is not a valid version`)
        return null
      }
      const repoURL = _.get(npmDoc, `versions['${latestDependencyVersion}'].repository.url`)

      return Promise.all(monorepo.map(async pkgRow => {
        const pkg = pkgRow.value
        if (!pkg.type) return
        if (_.includes(config.ignore, depName)) return
        if (_.includes(config.groups[groupName].ignore, depName)) return

        const oldPkgVersion = _.get(repoDoc, `packages['${pkg.filename}'].${pkg.type}.${depName}`)
        if (!oldPkgVersion) {
          log.warn(`exited transform creation: could not find old package version for ${depName}`, { newVersion: version, dependencyType: pkg.type, packageFile: _.get(repoDoc, `packages['${pkg.filename}']`) })
          return null
        }
        if (!semver.validRange(oldPkgVersion)) {
          log.warn(`exited transform creation: ${depName} oldPkgVersion: ${oldPkgVersion} is not a valid version`, { newVersion: latestDependencyVersion, oldVersion: oldPkgVersion })
          return null
        }
        const satisfies = semver.satisfies(latestDependencyVersion, oldPkgVersion)
        // no downgrades
        if (semver.ltr(latestDependencyVersion, oldPkgVersion)) {
          log.warn(`exited transform creation: ${depName} ${latestDependencyVersion} would be a downgrade from ${oldPkgVersion}`, { newVersion: latestDependencyVersion, oldVersion: oldPkgVersion })
          return null
        }

        const transforms = []
        if (!satisfies) satisfiesAll = false

        const commitMessageKey = !satisfies && pkg.type === 'dependencies'
          ? 'dependencyUpdate'
          : 'devDependencyUpdate'
        const commitMessageValues = { dependency: depName, version: latestDependencyVersion }
        let commitMessage = getMessage(config.commitMessages, commitMessageKey, commitMessageValues)

        if (!satisfies && openPR) {
          await upsert(repositories, openPR._id, {
            comments: [...(openPR.comments || []), latestDependencyVersion]
          })
          commitMessage += getMessage(config.commitMessages, 'closes', { number: openPR.number })
        }
        log.info(`commit message for ${depName} created`, { commitMessage })

        const satisfyingVersions = getSatisfyingVersions(npmDoc.versions, {
          value: { oldVersion: oldPkgVersion }
        })
        const oldVersionResolved = getOldVersionResolved(satisfyingVersions, npmDoc.distTags, 'latest')
        if (!oldVersionResolved) {
          log.warn(`exited transform creation: could not resolve old version for ${depName} (no update?)`, { newVersion: version, satisfyingVersions, latestDependencyVersion, oldPkgVersion })
          return null
        }

        if (semver.prerelease(latestDependencyVersion) && !semver.prerelease(oldVersionResolved)) {
          log.info(`exited transform creation: ${depName} ${latestDependencyVersion} is a prerelease on latest and user does not use prereleases for this dependency`, { latestDependencyVersion, oldPkgVersion })
          return null
        }

        transforms.push({
          transform: createTransformFunction(pkg.type, depName, latestDependencyVersion, log),
          path: pkg.filename,
          message: commitMessage,
          dependency: depName,
          oldVersion: oldVersionResolved,
          version: latestDependencyVersion,
          dependencyType: pkg.type,
          repoURL
        })
        return transforms
      }))
    }))
  }
  const transforms = _.compact(_.flattenDeep(await createTransformsArray(monorepo)))
  if (transforms.length === 0) return

  if (onlyUpdateLockfilesIfOutOfRange && satisfiesAll) {
    log.info('exiting: user wants out-of-range lockfile updates only', { config })
    return
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

  const { default_branch: base } = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: using default branch', { defaultBranch: base })

  const sha = await createBranch({
    installationId,
    owner,
    repoName: repo,
    repoDoc,
    branch: base,
    newBranch,
    transforms,
    processLockfiles,
    commitMessageTemplates: config.commitMessages
  })
  if (sha) {
    log.success(`github: branch ${newBranch} created`, { sha })
  }

  if (!sha) { // no branch was created
    log.error('github: no branch was created')
    return
  }

  let packageUpdateList = ''
  let reportedDependencies = []
  transforms.forEach(async transform => {
    if (transform.created && !reportedDependencies.includes(transform.dependency)) {
      const dependencyURL = getFormattedDependencyURL({ repositoryURL: transform.repoURL, dependency: transform.dependency })
      packageUpdateList += `- The \`${transform.dependencyType.replace('ies', 'y')}\` [${transform.dependency}](${dependencyURL}) was updated from \`${transform.oldVersion}\` to \`${transform.version}\`.\n`
      reportedDependencies.push(transform.dependency)
    }
  })

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
    processed: !satisfiesAll,
    packageUpdateList,
    group: groupName
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
    log.info(`github: commented on already open PR for ${dependency} in group ${groupName}`, { openPR })
    return
  }

  const title = getPrTitle({
    version: 'groupPR',
    dependency: dependencyKey,
    group: groupName,
    prTitles: config.prTitles })

  const dependencyLink = getFormattedDependencyURL({ repositoryURL: transforms[0].repoURL })
  // maybe adapt PR body
  const body = prContent({
    dependencyLink,
    oldVersionResolved,
    version,
    dependency,
    monorepoGroupName,
    type: highestPriorityDependency,
    release,
    diffCommits,
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
    log.success(`github: pull request for ${dependency} ${version} created`, { pullRequest: createdPr })
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
    log.warn('Could not create PR', { err })
    if (err.status !== 422) throw err

    const allPrs = await ghqueue.read(github => github.pulls.list({
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
