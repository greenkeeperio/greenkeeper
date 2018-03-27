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
const upsert = require('../lib/upsert')

const registryUrl = env.NPM_REGISTRY

// If we update dependencies, find any open PRs for that dependency and close the PRs by commit message

module.exports = async function ({ repositoryId, groupName }) {
  const { installations, repositories, logs } = await dbs()
  const repoDoc = await repositories.get(repositoryId)
  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-initial-subgroup-branch'})

  log.info('started')

  await updateRepoDoc({installationId, doc: repoDoc, log})
  const config = getConfig(repoDoc)
  const pathsForGroup = config.groups[groupName].packages
  if (_.isEmpty(pathsForGroup)) {
    log.warn(`exited: No packages and package.json found for group: ${groupName}`)
    return
  }

  const packageJsonFiles = _.get(repoDoc, ['packages'])
  if (_.isEmpty(packageJsonFiles)) {
    log.warn(`exited: No package.json files found`)
    return
  }
  await upsert(repositories, repoDoc._id, repoDoc)

  const [owner, repo] = repoDoc.fullName.split('/')

  const registry = RegClient()
  const registryGet = promisify(registry.get.bind(registry))
  // get for all package.jsons in a group
  // every package should be updated to the newest version
  const dependencyMeta = _.uniqWith(_.flatten(pathsForGroup.map(path => {
    return _.flatten(
     ['dependencies', 'devDependencies', 'optionalDependencies'].map(type => {
       return _.map(packageJsonFiles[path][type], (version, name) => ({ name, version, type }))
     })
    )
  })), _.isEqual)

  log.info('dependencies found', {parsedDependencies: dependencyMeta, packageJsonFiles: packageJsonFiles})
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
      if (
        _.includes(config.ignore, dependency.name) ||
        _.includes(config.groups[groupName].ignore, dependency.name)
      ) {
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

  const newBranch = config.branchPrefix + 'initial' + `-${groupName}`

  // create a transform loop for all the package.json paths and push into the transforms array below
  const transforms = pathsForGroup.map(path => {
    return {
      path,
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
  })

  const sha = await createBranch({ // try/catch
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  const depsUpdated = _.some(transforms, 'created')
  if (!depsUpdated) return

  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    initial: false, // Not _actually_ an inital branch :)
    sha,
    base: branch,
    head: newBranch,
    processed: false,
    depsUpdated
  })

  log.success('success')
}
