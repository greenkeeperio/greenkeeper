const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const semver = require('semver')
const getRangedVersion = require('../lib/get-ranged-version')

function seperateNormalAndMonorepos (packageFiles) {
  const resultsByRepo = groupPackageFilesByRepo(packageFiles)

  return _.partition(resultsByRepo, (result) => {
    return (result.length > 1 && hasDiffernetFilenames(result)) ||
    (result.length === 1 && result[0].value.filename !== 'package.json')
  })
}

function groupPackageFilesByRepo (packageFiles) {
  return _.groupBy(packageFiles, 'value.fullName')
}

function hasDiffernetFilenames (group) {
  if (group.length === 1) return true
  if (_.uniq(_.map(group, g => g.value.filename)).length > 1) return true
  return false
}

const order = {
  'dependencies': 1,
  'devDependencies': 2,
  'optionalDependencies': 3
}

function getHighestPriorityDependency (dependencies) {
  const types = dependencies.map(d => d.type)
  return types.sort((depA, depB) => order[depA] - order[depB])[0]
}

function sortByDependency (packageA, packageB) {
  return order[packageA.value.type] - order[packageB.value.type]
}

function filterAndSortPackages (packageFiles) {
  return packageFiles
    .filter(pkg => pkg.value.type !== 'peerDependencies')
    .sort(sortByDependency)
}

function getSatisfyingVersions (versions, pkg) {
  return Object.keys(versions)
    .filter(version => semver.satisfies(version, pkg.value.oldVersion))
    .sort(semver.rcompare)
}

function getOldVersionResolved (satisfyingVersions, distTags, distTag) {
  return satisfyingVersions[0] === distTags[distTag]
    ? satisfyingVersions[1]
    : satisfyingVersions[0]
}

function getJobsPerGroup ({
  config,
  monorepo,
  distTags,
  distTag,
  dependency,
  versions,
  account,
  repositoryId,
  plan
}) {
  const satisfyingVersions = getSatisfyingVersions(versions, monorepo[0])
  const oldVersionResolved = getOldVersionResolved(satisfyingVersions, distTags, distTag)
  const types = monorepo.map((x) => { return {type: x.value.type, filename: x.value.filename} })

  if (_.isEmpty(config) || _.isEmpty(config.groups)) return []

  const packageFiles = monorepo.map(result => result.value.filename)
  const groups = _.compact(_.map(config.groups, (group, key) => {
    let result = {}
    result[key] = group
    if (_.intersection(group.packages, packageFiles).length) {
      return result
    }
  }))

  return groups.map((group) => {
    // only include chages from
    const groupName = Object.keys(group)[0]
    const relevantMonorepoChangeFiles = monorepo.filter(change => {
      return group[groupName].packages.includes(change.value.filename)
    })

    return {
      data: Object.assign({
        name: 'create-group-version-branch',
        group,
        distTags,
        distTag,
        dependency,
        versions,
        repositoryId,
        plan,
        oldVersionResolved,
        installation: account.installation,
        types,
        oldVersion: monorepo[0].value.oldVersion,
        monorepo: relevantMonorepoChangeFiles
      }),
      plan
    }
  })
}

function createTransformFunction (type, dependency, version, log) {
  return (pkg) => {
    try {
      var json = JSON.parse(pkg)
      var parsed = jsonInPlace(pkg)
    } catch (e) {
      return // ignore parse errors
    }
    const oldPkgVersion = _.get(json, [type, dependency])
    if (!oldPkgVersion) {
      log.warn('exited: could not find old package version', {newVersion: version, packageJson: json})
      return
    }

    if (semver.ltr(version, oldPkgVersion)) { // no downgrades
      log.warn('exited: would be a downgrade', {newVersion: version, oldVersion: oldPkgVersion})
      return
    }

    parsed.set([type, dependency], getRangedVersion(version, oldPkgVersion))
    return parsed.toString()
  }
}

module.exports = {
  seperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved,
  getHighestPriorityDependency,
  createTransformFunction
}
