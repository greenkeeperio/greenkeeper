const _ = require('lodash')
const semver = require('semver')

function sepperateNormalAndMonorepos (packageFiles) {
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

function getJobsPerGroup (config, monorepo) {
  let jobs = []

  if (config && config.groups) {
    const packageFiles = monorepo.map(result => result.value.filename)

    const groups = _.compact(_.map(config.groups, (group, key) => {
      let result = {}
      result[key] = group
      if (_.intersection(group.packages, packageFiles).length) {
        return result
      }
    }))

    jobs = groups.map((group) => {
      return {
        data: {
          name: 'create-group-version-branch'
        }
      }
    })
  }

  return jobs
}

const order = {
  'dependencies': 1,
  'devDependencies': 2,
  'optionalDependencies': 3
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

module.exports = {
  sepperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved
}
