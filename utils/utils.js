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
        accountId: account.id || account._id,
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

const generateGitHubCompareURL = function (githubURL = '', fullName, branch, compareWith) {
  // Discussion: https://github.com/greenkeeperio/greenkeeper/issues/682
  // https://github.com/$USER/$REPO/compare/$REV_A...$REV_B
  return `${githubURL}/${fullName}/compare/${encodeURIComponent(branch)}...${encodeURIComponent(fullName.split('/')[0])}:${encodeURIComponent(compareWith)}`
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
    const lastgetNodeVersionIndex = lines.slice(nodeJSIndex + 1).findIndex((line) => {
      return line.match(/:/)
    })
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
const hasNodeVersion = function (version, newVersion, newCodeName) {
  const matches = ['node', 'stable', 'lts/\\*', `lts/${newCodeName}`, newCodeName, newVersion] // eslint-disable-line
  return !!matches.find((match) => {
    // first regex matches in array form ('- 10'), second regex matches the inline form ('10')
    return !!(version.match(RegExp(`([^.])(${match})`, 'i')) || version.match(RegExp(`^${match}$`, 'i')))
  })
}

// existingVersionStrings is just an array of strings: ['- 7', '- 8'] or ['9']  or ['v8.10']
// returns an index
const getNodeVersionIndex = function (existingVersionStrings, newVersion, newCodeName) {
  if (!existingVersionStrings || existingVersionStrings.length === 0) return -1
  return existingVersionStrings.findIndex((version) => {
    return hasNodeVersion(version, newVersion, newCodeName)
  })
}

// Stop! YAMLtime!
// existingVersions is the output of getNodeVersionsFromTravisYML
const addNodeVersionToTravisYML = function (travisYML, newVersion, newCodeName, existingVersions) {
  if (existingVersions.versions.length === 0) return travisYML
  // Should only add the new version if it is not present in any form
  const nodeVersionIndex = getNodeVersionIndex(existingVersions.versions, newVersion, newCodeName)
  const travisYMLLines = travisYML.split('\n')
  // We only need to do something if the new version isn’t present
  if (nodeVersionIndex === -1) {
    // TODO: get string delimiters from the previous version, if they exist, and wrap our new version in them
    // splice the new version back onto the end of the node version list in the original travisYMLLines array,
    // unless it wasn’t an array but an inline definition of a single version, eg: `node_js: 9`
    if (existingVersions.versions.length === 1 && existingVersions.startIndex === existingVersions.endIndex) {
      // A single node version was defined in inline format, now we want to define two versions in array format
      travisYMLLines.splice(existingVersions.startIndex, 1, 'node_js:')
      travisYMLLines.splice(existingVersions.startIndex + 1, 0, `- ${existingVersions.versions[0]}`)
      travisYMLLines.splice(existingVersions.startIndex + 2, 0, `- ${newVersion}`)
    } else {
      // Multiple node versions were defined in array format
      travisYMLLines.splice(existingVersions.endIndex + 1, 0, `- ${newVersion}`)
    }
  }
  return travisYMLLines.join('\n')
}
const addNodeVersionToNvmrc = function (newVersion) {
  return newVersion
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
  addNodeVersionToNvmrc
}
