const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')

const { monorepoDefinitions } = require('../utils/monorepo-definitions')

function getMonorepoGroup (groupname) {
  return monorepoDefinitions[groupname] || undefined
}

function getMonorepoGroupNameForPackage (packageName) {
  return Object.keys(monorepoDefinitions).find(group =>
    monorepoDefinitions[group].find(pkg => pkg === packageName))
}

function isPartOfMonorepo (dependency) {
  return !!module.exports.getMonorepoGroupNameForPackage(dependency)
}

async function hasAllMonorepoUdates (dependency, version) {
  const { npm } = await dbs()
  try {
    const group = module.exports.getMonorepoGroupNameForPackage(dependency)
    // read all registry changes
    const docs = await npm.allDocs({
      include_docs: true,
      keys: monorepoDefinitions[group]
    })

    const docsWithoutErrors = docs.rows
    .filter(row => {
      return !row.error
    }) // filter out error docs
    .map(row => row.doc)

    // turn doc list into lookup table packageName -> packageInfo
    // TODO: maybe do this on startup for all groups
    const registryChanges = docsWithoutErrors.reduce((acc, doc) => {
      acc[doc._id] = doc
      return acc
    }, {})

    // check if we have other monorepo packages
    const receivedAllregistryChanges = monorepoDefinitions[group].reduce((acc, packageName) => {
      const pkg = registryChanges[packageName]
      // this is the main bit
      if (pkg && pkg.distTags['latest'] && pkg.distTags['latest'] !== version) {
        return false
      }
      return acc
    }, true)
    return receivedAllregistryChanges
  } catch (err) {
    throw err
  }
}

async function updateMonorepoReleaseInfo (dependency, distTags, distTag, versions) {
  const { npm } = await dbs()
  const version = distTags[distTag]
  const monorepoGroupname = getMonorepoGroupNameForPackage(dependency)
  npm.upsert(`monorepo:${monorepoGroupname}:${version}`, (oldDoc) => {
    const result = { distTags, distTag, dependency, versions }
    return Object.assign(result, updatedAt(oldDoc))
  })
}

async function deleteMonorepoReleaseInfo (dependency, version) {
  const { npm } = await dbs()
  try {
    await npm.remove(`monorepo:${dependency}:${version}`)
  } catch (e) {
    if (e.message !== 'not_found') {
      throw e
    }
  }
}

async function pendingMonorepoReleases () {
  const { npm } = await dbs()
  // thx https://stackoverflow.com/questions/1197928/how-to-add-30-minutes-to-a-javascript-date-object#1214753
  const thirtyMinutesAgo = new Date(new Date().getTime() - 30 * 60000).toJSON()
  const result = await npm.query('monorepo-releases-by-time', {
    startkey: '1970-01-01T00:00:00.000Z',
    endkey: thirtyMinutesAgo,
    include_docs: true
  })

  return result.rows.map(row => row.doc) || []
}

module.exports = {
  isPartOfMonorepo,
  hasAllMonorepoUdates,
  getMonorepoGroup,
  getMonorepoGroupNameForPackage,
  updateMonorepoReleaseInfo,
  deleteMonorepoReleaseInfo,
  pendingMonorepoReleases
}
