const dbs = require('../lib/dbs')

function isPartOfMonorepo (dependency) {
  return !!findGroupForDependency(dependency)
}

async hasAllMonorepoUdates (dependency, version) {
  const { npm, log } = await dbs()
  try {
    const group = findGroupForDependency(dependency)

    // read all registry changes
    const docs = await npm.allDocs({ keys: monorepoDefinitions[group] })
      .filter(doc => !doc.error) // filter out error docs

    // turn doc list into lookup table packageName -> packageInfo
    // TODO: maybe do this on startup for all groups
    const registryChanges = docs.reduce((acc, doc) => acc[doc._id] = doc, {})

    // check if we have other monorepo packages
    const receivedAllregistryChanges = group.reduce((acc, packageName) => {
      const package = registryChanges[packageName]
      // this is the main bit
      if (package && package.distTags['latest'] && package.distTags['latest'] === version) {
        return true
      }
      return acc
    }, false)
    return receivedAllregistryChanges
  } catch (err) {
    throw err
  }
}

module.exports = {
  isPartOfMonorepo,
  hasAllMonorepoUdates
}

function findGroupForDependency (name) {
  Object.keys(monorepoDefinitions).find(group =>
    group.find(package => package === name)
}

// const monorepoDefinitions = {
//  "prefix": [
//    "prefix-full-name",
//    "prefix-full-other"
//  ]
//}
const monorepoDefinitions = {
  "pouchdb": {
    "pouchdb",
    "pouchdb-abstract-mapreduce",
    "pouchdb-adapter-fruitdown",
  	"pouchdb-adapter-http",
		"pouchdb-adapter-idb",
		"pouchdb-adapter-indexeddb",
		"pouchdb-adapter-leveldb",
		"pouchdb-adapter-leveldb-core",
		"pouchdb-adapter-localstorage",
		"pouchdb-adapter-memory",
		"pouchdb-adapter-node-websql",
	  "pouchdb-adapter-utils",
		"pouchdb-adapter-websql",
		"pouchdb-adapter-websql-core",
		"pouchdb-binary-utils",
		"pouchdb-browser",
		"pouchdb-changes-filter",
		"pouchdb-checkpointer",
		"pouchdb-collate",
		"pouchdb-collections",
		"pouchdb-core",
		"pouchdb-debug",
		"pouchdb-errors",
		"pouchdb-fetch",
		"pouchdb-find",
		"pouchdb-for-coverage",
		"pouchdb-generate-replication-id",
		"pouchdb-json",
		"pouchdb-mapreduce",
		"pouchdb-mapreduce-utils",
		"pouchdb-md5",
		"pouchdb-merge",
		"pouchdb-node",
		"pouchdb-replication",
		"pouchdb-selector-core",
		"pouchdb-utils",
		"sublevel-pouchdb"
  }
}
