const _ = require('lodash')
const crypto = require('crypto')

const updatedAt = require('./updated-at')
const { getFiles, formatPackageJson } = require('./get-files')

module.exports = {
  createDocs,
  updateRepoDoc
}

//  if a package.json is added/renamed/moved in the .greenkeeperrc
//  if a .greenkeeperrc is added
// trigger (several) initial-subgroup-pr

async function updateRepoDoc (installationId, doc) {
  const fullName = doc.fullName
  const files = await getFiles(installationId, fullName)
  doc.files = _.mapValues(files, content => !!content)
  // need a new function that will loop over all found package.json files and add them with their path as a key
  const pkg = formatPackageJson(files['package.json'])
  if (!pkg) {
    _.unset(doc, ['packages', 'package.json'])
    return doc
  }

  _.set(doc, ['packages', 'package.json'], pkg)
  return doc
}

// needs to handle multiple lock files in different paths
// creates an array of arrays
// files: [
//   package.json: ['./', './backend', './frontend']
//   package-lock.json: ['./', './backend']
//   npm-shrinkwrap.json: [],
//   yarn.lock: []
// ]

// need to add a top level config key with the contents of the greenkeeperrc
function createDocs ({ repositories, accountId }) {
  return repositories.map(repo => updatedAt({
    _id: String(repo.id),
    type: 'repository',
    enabled: false,
    accountId,
    fullName: repo.full_name,
    private: repo.private,
    fork: repo.fork,
    hasIssues: repo.has_issues,
    accountToken: crypto.randomBytes(32).toString('hex'),
    packages: {}
  }))
}
