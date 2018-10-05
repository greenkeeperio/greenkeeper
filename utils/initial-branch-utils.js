const _ = require('lodash')
const semver = require('semver')
const getRangedVersion = require('../lib/get-ranged-version')
const env = require('../lib/env')
const registryUrl = env.NPM_REGISTRY

// expects an array of package.json paths, returns an array of unique dependencies from those package.jsons:
/*
  Returns:
  [{
    name: '@finnpauls/dep',
    version: '1.0.0',
    type: 'devDependencies'
  }]
*/
function getDependenciesFromPackageFiles (packagePaths, packageJsonContents) {
  return _.compact(_.uniqWith(_.flatten(packagePaths.map(path => {
    return _.flatten(
      ['dependencies', 'devDependencies', 'optionalDependencies'].map(type => {
        if (packageJsonContents[path]) {
          return _.map(packageJsonContents[path][type], (version, name) => ({ name, version, type }))
        }
      })
    )
  })), _.isEqual))
}

// add npm package data to dependency info from previous function
/*
  Returns:
  [{
    name: '@finnpauls/dep',
    version: '1.0.0',
    type: 'devDependencies',
    data: {
      'dist-tags': [Object]
    }
  }]
*/
async function addNPMPackageData (dependencyInfo, registryGet, log) {
  return Promise.mapSeries(dependencyInfo, async dep => {
    try {
      dep.data = await registryGet(registryUrl + dep.name.replace('/', '%2F'), {
      })
      return dep
    } catch (err) {
      log.error('npm: Could not get package data', { dependency: dep, error: err })
    }
  })
}

// get new version for all dependencies in files
/*
  Arguments:
  packagePaths: array of strings, eg. ['package.json', 'frontend/package.json']
  packageJsonContents: array of objects, eg. [{ devDependencies: { '@finnpauls/dep': '1.0.0'} }]
  registryGet: instance of promisified `npm-registry-client`
  ignore: array of strings, eg. ['eslint', 'standard'], from config (package.json, greenkeeper.json etc.)
  log: an instance of the logger

  Returns:
  [{
    name: '@finnpauls/dep',
    version: '1.0.0',
    type: 'devDependencies',
    data: {
      'dist-tags': [Object]
    },
    newVersion: '2.0.0'
  }]
*/
async function getUpdatedDependenciesForFiles ({ packagePaths, packageJsonContents, registryGet, ignore, log }) {
  const dependencyInfo = module.exports.getDependenciesFromPackageFiles(packagePaths, packageJsonContents, log)
  // Filter out ignored dependencies
  const unignoredDependencyInfo = dependencyInfo.filter((dep) => !ignore.includes(dep.name))
  log.info('dependencies found', { parsedDependencies: unignoredDependencyInfo, ignoredDependencies: ignore, packageJsonContents: packageJsonContents })
  let dependencies = await module.exports.addNPMPackageData(unignoredDependencyInfo, registryGet, log)
  let dependencyActionsLog = {}
  // add `newVersion` to each dependency object in the array
  const outputDependencies = _(dependencies)
    .filter(Boolean) // remove falsy values from input array
    .map(dependency => {
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

      let latest = _.get(dependency, 'data.dist-tags.latest')
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
    .filter(Boolean) // remove falsy values from output array
    .value() // run lodash chain

  log.info('parsed dependency actions', { dependencyActionsLog })
  return outputDependencies
}

module.exports = {
  getUpdatedDependenciesForFiles,
  addNPMPackageData,
  getDependenciesFromPackageFiles
}
