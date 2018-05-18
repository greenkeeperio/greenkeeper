const _ = require('lodash')
const dbs = require('../lib/dbs')
const env = require('../lib/env')
const updatedAt = require('../lib/updated-at')

const monorepoBaseDefinitions = require('../utils/monorepo-definitions')

let dbDefinitions = JSON.parse(JSON.stringify(monorepoBaseDefinitions))
let dbDefinitionsLastUpdated = 0

async function getMonorepoDefinitions () {
  const { monorepo } = await dbs()

  if (dateMinusMinutes(5) > dbDefinitionsLastUpdated || env.NODE_ENV === 'testing') {
    const allDocs = await monorepo.allDocs({ include_docs: true })
    dbDefinitionsLastUpdated = new Date()
    _.forEach(allDocs.rows, row => {
      const doc = row.doc
      if (!doc.packages) { return }
      dbDefinitions[doc._id] = doc.packages
    })
  }

  return dbDefinitions
}

async function getMonorepoGroup (groupname) {
  const monorepoDefinitions = await getMonorepoDefinitions()
  return monorepoDefinitions[groupname] || undefined
}

async function getMonorepoGroupNameForPackage (packageName) {
  const monorepoDefinitions = await getMonorepoDefinitions()
  return Object.keys(monorepoDefinitions).find(group =>
    monorepoDefinitions[group].find(pkg => pkg === packageName))
}

async function isPartOfMonorepo (dependency) {
  return !!await module.exports.getMonorepoGroupNameForPackage(dependency)
}

async function hasAllMonorepoUdates (dependency, version) {
  const monorepoDefinitions = await getMonorepoDefinitions()
  const { npm } = await dbs()
  try {
    const group = await module.exports.getMonorepoGroupNameForPackage(dependency)
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
  const monorepoGroupname = await getMonorepoGroupNameForPackage(dependency)
  await npm.upsert(`monorepo:${monorepoGroupname}:${version}`, (oldDoc) => {
    const result = { distTags, distTag, dependency, versions }
    return Object.assign(result, updatedAt(oldDoc))
  })
}

async function deleteMonorepoReleaseInfo (dependency, version) {
  const { npm } = await dbs()
  try {
    await npm.remove(`monorepo:${dependency}:${version}`)
  } catch (e) {
    if (e.name !== 'not_found') {
      throw e
    }
  }
}

async function pendingMonorepoReleases () {
  const { npm } = await dbs()
  // thx https://stackoverflow.com/questions/1197928/how-to-add-30-minutes-to-a-javascript-date-object#1214753
  const thirtyMinutesAgo = dateMinusMinutes(5).toJSON()
  const result = await npm.query('monorepo-releases-by-time', {
    startkey: '1970-01-01T00:00:00.000Z',
    endkey: thirtyMinutesAgo,
    include_docs: true
  })

  return result.rows.map(row => row.doc) || []
}

function dateMinusMinutes (minutes) {
  return new Date(new Date().getTime() - minutes * 60000)
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
