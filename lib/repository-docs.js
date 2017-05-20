const _ = require('lodash')
const crypto = require('crypto')

const updatedAt = require('./updated-at')

module.exports = {
  readPackageJson,
  setPackageJson,
  createDocs
}

async function readPackageJson (github, fullName) {
  const [owner, repo] = fullName.split('/')
  try {
    const file = await github.repos.getContent({
      path: 'package.json',
      repo,
      owner
    })
    var pkg = JSON.parse(Buffer.from(file.content, 'base64'))
  } catch (e) {
    return null
  }

  return _.pick(pkg, [
    'name',
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'greenkeeper',
    'engines',
    'maintainers',
    'author'
  ])
}

async function setPackageJson (github, doc) {
  const pkg = await readPackageJson(github, doc.fullName)

  if (!pkg) {
    _.unset(doc, ['packages', 'package.json'])
    return doc
  }

  _.set(doc, ['packages', 'package.json'], pkg)

  return doc
}

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
