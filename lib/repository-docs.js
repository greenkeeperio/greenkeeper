const _ = require('lodash')
const crypto = require('crypto')

const updatedAt = require('./updated-at')

module.exports = {
  readPackageJson,
  createDocs,
  updateRepoDoc
}

async function updateRepoDoc (github, doc) {
  const fullName = doc.fullName
  const fileList = [
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock'
  ]
  const files = await getFiles(github, fullName, fileList)

  doc.files = _.mapValues(files, content => !!content)
  const pkg = formatPackageJson(files['package.json'])
  if (!pkg) {
    _.unset(doc, ['packages', 'package.json'])
    return doc
  }

  _.set(doc, ['packages', 'package.json'], pkg)
  return doc
}

function formatPackageJson (content) {
  try {
    var pkg = JSON.parse(Buffer.from(content, 'base64'))
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

async function readPackageJson (github, fullName) {
  const [owner, repo] = fullName.split('/')
  const file = await getGithubFile(github, {
    path: 'package.json',
    repo,
    owner
  })
  if (!file.content) return
  return formatPackageJson(file.content)
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

async function getFiles (github, fullName, files) {
  const [owner, repo] = fullName.split('/')
  const filesRequested = await Promise.all(
    files.map(path => getGithubFile(github, { path, owner, repo }))
  )
  const contentByFile = _(filesRequested)
    .keyBy(file => file.path)
    .mapValues(file => file.content)
    .value()
  return contentByFile
}

async function getGithubFile (github, { path, owner, repo }) {
  try {
    return await github.repos.getContent({ path, owner, repo })
  } catch (e) {
    return { path, content: false }
  }
}
