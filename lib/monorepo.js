const dbs = require('../lib/dbs')

function getMonorepoGroup (name) {
  return Object.keys(module.exports.monorepoDefinitions).find(group =>
    module.exports.monorepoDefinitions[group].find(pkg => pkg === name))
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
      keys: module.exports.monorepoDefinitions[group]
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
    const receivedAllregistryChanges = module.exports.monorepoDefinitions[group].reduce((acc, packageName) => {
      const pkg = registryChanges[packageName]
      // this is the main bit
      if (pkg && pkg.distTags['latest'] && pkg.distTags['latest'] === version) {
        return true
      }
      return acc
    }, false)
    return receivedAllregistryChanges
  } catch (err) {
    throw err
  }
}

// const monorepoDefinitions = {
//  "prefix": [
//    "prefix-full-name",
//    "prefix-full-other"
//  ]
// }
const monorepoDefinitions = {
  'pouchdb': [
    'pouchdb',
    'pouchdb-abstract-mapreduce',
    'pouchdb-adapter-fruitdown',
    'pouchdb-adapter-http',
    'pouchdb-adapter-idb',
    'pouchdb-adapter-indexeddb',
    'pouchdb-adapter-leveldb',
    'pouchdb-adapter-leveldb-core',
    'pouchdb-adapter-localstorage',
    'pouchdb-adapter-memory',
    'pouchdb-adapter-node-websql',
    'pouchdb-adapter-utils',
    'pouchdb-adapter-websql',
    'pouchdb-adapter-websql-core',
    'pouchdb-binary-utils',
    'pouchdb-browser',
    'pouchdb-changes-filter',
    'pouchdb-checkpointer',
    'pouchdb-collate',
    'pouchdb-collections',
    'pouchdb-core',
    'pouchdb-debug',
    'pouchdb-errors',
    'pouchdb-fetch',
    'pouchdb-find',
    'pouchdb-for-coverage',
    'pouchdb-generate-replication-id',
    'pouchdb-json',
    'pouchdb-mapreduce',
    'pouchdb-mapreduce-utils',
    'pouchdb-md5',
    'pouchdb-merge',
    'pouchdb-node',
    'pouchdb-replication',
    'pouchdb-selector-core',
    'pouchdb-utils',
    'sublevel-pouchdb'
  ]
}

module.exports = {
  isPartOfMonorepo,
  hasAllMonorepoUdates,
  getMonorepoGroup,
  monorepoDefinitions
}
