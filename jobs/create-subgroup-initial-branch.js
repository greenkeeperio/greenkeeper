const Log = require('gk-log')
const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const { promisify } = require('bluebird')
const semver = require('semver')
const RegClient = require('../lib/npm-registry-client')
const env = require('../lib/env')
const getRangedVersion = require('../lib/get-ranged-version')
const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const createBranch = require('../lib/create-branch')
const { updateRepoDoc } = require('../lib/repository-docs')
const githubQueue = require('../lib/github-queue')
const { maybeUpdatePaymentsJob } = require('../lib/payments')
const upsert = require('../lib/upsert')

const registryUrl = env.NPM_REGISTRY

// if we update dependencies find open PRs for that dependency and close the PRs by commit message

module.exports = async function ({ repositoryId, groupname }) {
  const { installations, repositories, logs } = await dbs()
  const repoDoc = await repositories.get(repositoryId)
  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-initial-subgroup-branch'})

  log.info('started')

  if (repoDoc.fork && !repoDoc.hasIssues) { // we should allways check if issues are disabled and exit
    log.warn('exited: Issues disabled on fork')
    return
  }

  await updateRepoDoc(installationId, repoDoc)

  // Object.keys(repoDoc.packages).length > 0
  if (!_.get(repoDoc, ['packages', 'package.json'])) {
    log.warn('exited: No packages and package.json found')
    return
  }
  await upsert(repositories, repoDoc._id, repoDoc)

  const config = getConfig(repoDoc)
  if (config.disabled) {
    log.warn('exited: Greenkeeper is disabled for this repo in package.json')
    return
  }
  const pkg = _.get(repoDoc, ['packages', 'package.json']) // this is duplicated code (merge with L44)
  if (!pkg) return

  const [owner, repo] = repoDoc.fullName.split('/')

  await createDefaultLabel({ installationId, owner, repo, name: config.label })

  const registry = RegClient()
  const registryGet = promisify(registry.get.bind(registry))
  // get for all package.jsons in a group
  // every package should be updated to the newest version
  const dependencyMeta = _.flatten(
    ['dependencies', 'devDependencies', 'optionalDependencies'].map(type => {
      return _.map(pkg[type], (version, name) => ({ name, version, type }))
    })
  )
  log.info('dependencies found', {parsedDependencies: dependencyMeta, packageJson: pkg})
  let dependencies = await Promise.mapSeries(dependencyMeta, async dep => {
    try {
      dep.data = await registryGet(registryUrl + dep.name.replace('/', '%2F'), {
      })
      return dep
    } catch (err) {
      log.error('npm: Could not get package data', {dependency: dep})
    }
  })
  let dependencyActionsLog = {}
  dependencies = _(dependencies)
    .filter(Boolean)
    .map(dependency => {
      let latest = _.get(dependency, 'data.dist-tags.latest')
      if (_.includes(config.ignore, dependency.name)) {
        dependencyActionsLog[dependency.name] = 'ignored in config'
        return
      }
      // neither version nor range, so it's something weird (git url)
      // better not touch it
      if (!semver.validRange(dependency.version)) {
        dependencyActionsLog[dependency.name] = 'invalid range'
        return
      }
      // new version is prerelease
      const oldIsPrerelease = _.get(
        semver.parse(dependency.version),
        'prerelease.length'
      ) > 0
      const prereleaseDiff = oldIsPrerelease &&
        semver.diff(dependency.version, latest) === 'prerelease'
      if (
        !prereleaseDiff &&
        _.get(semver.parse(latest), 'prerelease.length', 0) > 0
      ) {
        const versions = _.keys(_.get(dependency, 'data.versions'))
        latest = _.reduce(versions, function (current, next) {
          const parsed = semver.parse(next)
          if (!parsed) return current
          if (_.get(parsed, 'prerelease.length', 0) > 0) return current
          if (semver.gtr(next, current)) return next
          return current
        })
      }
      // no to need change anything :)
      if (semver.satisfies(latest, dependency.version)) {
        dependencyActionsLog[dependency.name] = 'satisfies semver'
        return
      }
      // no downgrades
      if (semver.ltr(latest, dependency.version)) {
        dependencyActionsLog[dependency.name] = 'would be a downgrade'
        return
      }
      dependency.newVersion = getRangedVersion(latest, dependency.version)
      dependencyActionsLog[dependency.name] = `updated to ${dependency.newVersion}`
      return dependency
    })
    .filter(Boolean)
    .value()

  log.info('parsed dependency actions', {dependencyActionsLog})

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo })) // wrap in try/catch
  log.info('github: repository info', {repositoryInfo: ghRepo})

  const branch = ghRepo.default_branch

  const newBranch = config.branchPrefix + 'initial' + `-${groupname}`

  let badgeAlreadyAdded = false
  // create a transform loop for all the package.json paths and push into the transforms array below
  const transforms = [
    {
      path: 'package.json',
      message: 'chore(package): update dependencies',
      transform: oldPkg => {
        const oldPkgParsed = JSON.parse(oldPkg)
        const inplace = jsonInPlace(oldPkg)

        dependencies.forEach(({ type, name, newVersion }) => {
          if (!_.get(oldPkgParsed, [type, name])) return

          inplace.set([type, name], newVersion)
        })
        return inplace.toString()
      }
    }
  ]

  const sha = await createBranch({ // try/catch
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  if (!sha) {
    // When there are no changes and the badge already exists we can enable right away
    if (badgeAlreadyAdded) {
      await upsert(repositories, repoDoc._id, { enabled: true })
      log.info('Repository silently enabled')
      return maybeUpdatePaymentsJob(accountId, repoDoc.private)
    } else {
      log.error('Could not create initial branch')
      throw new Error('Could not create initial branch')
    }
  }

  const depsUpdated = transforms[0].created
  const travisModified = false
  const badgeAdded = false

  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    initial: true,
    sha,
    base: branch,
    head: newBranch,
    processed: false,
    depsUpdated,
    travisModified,
    badgeAdded
  })

  log.success('success')

  return {
    delay: 30 * 60 * 1000,
    data: {
      name: 'initial-timeout-pr',
      repositoryId,
      accountId
    }
  }
}

async function createDefaultLabel ({ installationId, name, owner, repo }) {
  if (name !== false) {
    try {
      await githubQueue(installationId).write(github => github.issues.createLabel({
        owner,
        repo,
        name,
        color: '00c775'
      }))
    } catch (e) {}
  }
}
