const dbs = require('../lib/dbs')
const { monorepoDefinitions } = require('../utils/monorepo-definitions')

function getMonorepoGroup (name) {
  return Object.keys(monorepoDefinitions).find(group =>
    monorepoDefinitions[group].find(pkg => pkg === name))
}

function isPartOfMonorepo (dependency) {
  return !!module.exports.getMonorepoGroup(dependency)
}

async function hasAllMonorepoUdates (dependency, version) {
  const { npm } = await dbs()
  try {
    const group = module.exports.getMonorepoGroup(dependency)
    // read all registry changes
    const docs = await npm.allDocs({
      include_docs: true,
      keys: monorepoDefinitions[group]
    })

    const docsWithoutErrors = docs.rows
    .map(row => row.doc)
    .filter(doc => {
      return !doc.error
    }) // filter out error docs

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

module.exports = {
  isPartOfMonorepo,
  hasAllMonorepoUdates,
  getMonorepoGroup
}
