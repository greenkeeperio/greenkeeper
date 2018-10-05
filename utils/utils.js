const _ = require('lodash')
const env = require('../lib/env')
const jsonInPlace = require('json-in-place')
const semver = require('semver')
const getRangedVersion = require('../lib/get-ranged-version')

function seperateNormalAndMonorepos (packageFiles) {
  const resultsByRepo = groupPackageFilesByRepo(packageFiles)

  return _.partition(resultsByRepo, (result) => {
    // The repo is a monorepo if:
    // - there’s more more than one file in the result array and
    //   - their file paths aren’t all equal
    //   - their file paths are all equal, but they’re not `package.json`
    // - there’s only one file, and its path is _not_ `package.json`
    return (result.length > 1 && hasDifferentFilenames(result)) ||
    (result.length === 1 && result[0].value.filename !== 'package.json')
  })
}

function groupPackageFilesByRepo (packageFiles) {
  return _.groupBy(packageFiles, 'value.fullName')
}

function hasDifferentFilenames (group) {
  if (group.length === 1) return true
  const uniqueFilenames = _.uniq(_.map(group, g => g.value.filename))
  if (uniqueFilenames.length > 1) return true
  if (uniqueFilenames[0] !== 'package.json') return true
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
  plan,
  isFromHook,
  log
}) {
  const satisfyingVersions = getSatisfyingVersions(versions, monorepo[0])
  const oldVersionResolved = getOldVersionResolved(satisfyingVersions, distTags, distTag)
  const types = monorepo.map((x) => { return { type: x.value.type, filename: x.value.filename } })

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
    const version = distTags[distTag]
    if (semver.prerelease(version) && !semver.prerelease(relevantMonorepoChangeFiles[0].value.oldVersion)) {
      log.info(`exited: ${dependency} ${version} is a prerelease on latest and user does not use prereleases`)
      return
    }

    return {
      data: Object.assign({
        name: 'create-group-version-branch',
        group,
        version,
        dependency,
        versions,
        repositoryId,
        plan,
        oldVersionResolved,
        installation: account.installation,
        accountId: account.id || account._id,
        types,
        oldVersion: monorepo[0].value.oldVersion,
        monorepo: relevantMonorepoChangeFiles,
        isFromHook
      }),
      plan
    }
  })
}

function createTransformFunction (type, dependency, version, log) {
  return (packageJson) => {
    try {
      var json = JSON.parse(packageJson)
      var parsed = jsonInPlace(packageJson)
    } catch (e) {
      return // ignore parse errors
    }
    const oldPkgVersion = _.get(json, [type, dependency])
    if (!oldPkgVersion) {
      log.warn(`exited: could not find old package version for dependency ${dependency}`, { newVersion: version, packageJson: json })
      return
    }

    if (semver.ltr(version, oldPkgVersion)) { // no downgrades
      log.warn('exited: would be a downgrade', { dependency, newVersion: version, oldVersion: oldPkgVersion })
      return
    }

    parsed.set([type, dependency], getRangedVersion(version, oldPkgVersion))
    return parsed.toString()
  }
}

// 'legacy' repoDocs have only true/false set at repository.files['yarn.lock'] ect
// 'newer' repoDocs have an array (empty or with the paths)
// packageFilename: path of pckage.json
const getLockfilePath = function (files, packageFilename) {
  const convertedFiles = _.flatten(Object.keys(files).map(key => {
    if (files[key] === true) return key
    else return files[key]
  }))

  const hasPackageLock = _.includes(convertedFiles, packageFilename.replace('package.json', 'package-lock.json'))
  if (hasPackageLock) return packageFilename.replace('package.json', 'package-lock.json')

  const hasYarnLock = _.includes(convertedFiles, packageFilename.replace('package.json', 'yarn.lock'))
  if (hasYarnLock) return packageFilename.replace('package.json', 'yarn.lock')

  return null
}

const generateGitHubCompareURL = function (fullName, branch, compareWith) {
  // Discussion: https://github.com/greenkeeperio/greenkeeper/issues/682
  // https://github.com/$USER/$REPO/compare/$REV_A...$REV_B
  return `${env.GITHUB_URL}/${fullName}/compare/${encodeURIComponent(branch)}...${encodeURIComponent(fullName.split('/')[0])}:${encodeURIComponent(compareWith)}`
}

const getNodeVersionsFromTravisYML = function (yml) {
  let lines = yml.split('\n')
  const nodeJSIndex = lines.findIndex((line) => {
    return line.replace(/\s/g, '').includes('node_js:')
  })
  let results = {
    startIndex: nodeJSIndex,
    endIndex: nodeJSIndex,
    versions: []
  }
  if (nodeJSIndex === -1) return results
  // Check whether there’s a single node version on the same line: `node_js: 8` instead of an array
  if (lines[nodeJSIndex].replace(/\s/g, '') === 'node_js:') {
    // this is our multi node config
    let lastgetNodeVersionIndex = lines.slice(nodeJSIndex + 1).findIndex((line) => {
      // node_js block ends either in an empty line or a new key, which must include a `:`
      return line.match(/:/) || line.trim().length === 0
    })
    if (lastgetNodeVersionIndex === -1) {
      lastgetNodeVersionIndex = lines.length
    }
    results.endIndex = nodeJSIndex + lastgetNodeVersionIndex
    /*
      This returns an array of node version lines (with dashes and whitespace!):
      [
        "- '4'",
        "- '6'",
        "- '8'",
        "- 'node'"
      ]

    */
    results.versions = lines.slice(nodeJSIndex + 1, nodeJSIndex + lastgetNodeVersionIndex + 1)
  } else {
    // this is our single node version from inline format: `node_js: 8`
    results.versions = new Array(lines[nodeJSIndex].replace(/node_js:/g, '').replace(/\s/g, ''))
  }

  return results
}

// version is a string: 'v8.10', '- "10"', 'Dubnium', "- 'lts/*'" etc
// returns a boolean
// versionOnly: true will _not_ match placeholder strings for current versions, such as `stable`
const hasNodeVersion = function (version, newVersion, newCodeName, versionOnly = false) {
  let matches = [`lts/${newCodeName}`, newCodeName, newVersion] // eslint-disable-line
  const tags = ['node', 'stable', 'lts/\\*']
  if (!versionOnly) {
    matches = matches.concat(tags)
  }
  const overallResult = !!matches.find((match) => {
    // first regex matches in array form ('- 10'), second regex matches the inline form ('10')
    return !!(version.match(RegExp(`([^.])(${match})`, 'i')) || version.match(RegExp(`^${match}`, 'i')))
  })
  return overallResult
}

// existingVersionStrings is just an array of strings: ['- 7', '- 8'] or ['9']  or ['v8.10']
// returns an index
const getNodeVersionIndex = function (existingVersionStrings, newVersion, newCodeName, versionOnly = false) {
  if (!existingVersionStrings || existingVersionStrings.length === 0) return -1
  return existingVersionStrings.findIndex((version) => {
    return hasNodeVersion(version, newVersion, newCodeName, versionOnly)
  })
}

// Stop! YAMLtime!
// existingVersions is the output of getNodeVersionsFromTravisYML
const addNodeVersionToTravisYML = function (travisYML, newVersion, newCodeName, existingVersions) {
  // Should only add the new version if it is not present in any form
  if (existingVersions.versions.length === 0) return travisYML
  const nodeVersionIndex = getNodeVersionIndex(existingVersions.versions, newVersion, newCodeName)
  const travisYMLLines = travisYML.split('\n')
  // We only need to do something if the new version isn’t present
  if (nodeVersionIndex === -1) {
    let delimiter = ''
    let leadingSpaces = ''
    if (existingVersions.versions && existingVersions.versions.length > 0) {
      if (existingVersions.versions[0].match(/"/)) {
        delimiter = '"'
      }
      if (existingVersions.versions[0].match(/'/)) {
        delimiter = "'"
      }
      leadingSpaces = existingVersions.versions[0].match(/^([ ]*)/)[1]
    }
    // splice the new version back onto the end of the node version list in the original travisYMLLines array,
    // unless it wasn’t an array but an inline definition of a single version, eg: `node_js: 9`
    if (existingVersions.versions.length === 1 && existingVersions.startIndex === existingVersions.endIndex) {
      // A single node version was defined in inline format, now we want to define two versions in array format
      travisYMLLines.splice(existingVersions.startIndex, 1, 'node_js:')
      travisYMLLines.splice(existingVersions.startIndex + 1, 0, `${leadingSpaces}- ${existingVersions.versions[0]}`)
      travisYMLLines.splice(existingVersions.startIndex + 2, 0, `${leadingSpaces}- ${delimiter}${newVersion}${delimiter}`)
    } else {
      // Multiple node versions were defined in array format
      travisYMLLines.splice(existingVersions.endIndex + 1, 0, `${leadingSpaces}- ${delimiter}${newVersion}${delimiter}`)
    }
  }
  return travisYMLLines.join('\n')
}
const updateNodeVersionToNvmrc = function (newVersion) {
  return `${newVersion}\n`
}

// existingVersions is the output of getNodeVersionsFromTravisYML
const removeNodeVersionFromTravisYML = function (travisYML, newVersion, newCodeName, existingVersions) {
  // Should only remove the old version if it is actually present in any form
  if (existingVersions.versions.length === 0) return travisYML
  const nodeVersionIndex = getNodeVersionIndex(existingVersions.versions, newVersion, newCodeName, true)
  let travisYMLLines = travisYML.split('\n')
  // We only need to do something if the old version is present
  if (nodeVersionIndex !== -1) {
    // If it’s the only version we don’t want to remove it
    if (existingVersions.versions.length !== 1) {
      // Multiple node versions were defined in array format
      // set lines we want to remove to undefined in existingVersion.versions and filter them out afterwards
      const updatedVersionsArray = _.filter(existingVersions.versions.map((version) => {
        return hasNodeVersion(version, newVersion, newCodeName, true) ? undefined : version
      }), Boolean)
      // splice the updated existingversions into travisymllines
      travisYMLLines.splice(existingVersions.startIndex + 1, existingVersions.endIndex - existingVersions.startIndex, updatedVersionsArray)
      // has an array in an array, needs to be flattened
      travisYMLLines = _.flatten(travisYMLLines)
    }
  }
  return travisYMLLines.join('\n')
}

const addNewLowestAndDeprecate = function ({
  travisYML,
  nodeVersion,
  codeName,
  newLowestVersion,
  newLowestCodeName
}) {
  let versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedTravisYaml = addNodeVersionToTravisYML(travisYML, newLowestVersion, newLowestCodeName, versions)
  versions = getNodeVersionsFromTravisYML(updatedTravisYaml)
  return removeNodeVersionFromTravisYML(updatedTravisYaml, nodeVersion, codeName, versions)
}

const hasTooManyPackageJSONs = function (repo) {
  return repo.packages && Object.keys(repo.packages).length > 300
}

module.exports = {
  seperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved,
  getHighestPriorityDependency,
  createTransformFunction,
  generateGitHubCompareURL,
  getNodeVersionsFromTravisYML,
  hasNodeVersion,
  getNodeVersionIndex,
  addNodeVersionToTravisYML,
  removeNodeVersionFromTravisYML,
  updateNodeVersionToNvmrc,
  addNewLowestAndDeprecate,
  hasTooManyPackageJSONs,
  getLockfilePath
}
