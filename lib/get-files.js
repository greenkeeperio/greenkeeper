const _ = require('lodash')
const githubQueue = require('./github-queue')

const fileList = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock'
]

async function getGithubFile (ghqueue, { path, owner, repo }) {
  try {
    return await ghqueue.read(github => github.repos.getContent({ path, owner, repo }))
  } catch (e) {
    return { name: path, path, content: false }
  }
}

async function getFiles (installationId, fullName, files = fileList) {
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = fullName.split('/')
  const filesRequested = await Promise.all(
    files.map((path) => getGithubFile(ghqueue, { path, owner, repo }))
  )

  // returns an object of all files that were
  // supplied grouped together by their name (`yarn.lock`):
  //
  // { 'package.json': [
  //   { path: 'package.json',
  //     name: 'package.json',
  //     content: 'eyJuYW1lIjoidGVzdCJ9', ... },
  //   { path: 'backend/package.json',
  //     name: 'package.json',
  //     content: 'eyJuYW1lIjoidGVzdCJ9', ... }]
  //   'yarn.lock': [
  //   { path: 'backend/yarn.lock',
  //     name: 'yarn.lock',
  //     content: 'djadhkjawdka', ...}]
  // }

  return _.groupBy(filesRequested, file => file.name)
}

function formatPackageJson (content) {
  if (!content) return null
  const packages = {}

  content.map(packageJson => {
    try {
      var pkg = JSON.parse(Buffer.from(packageJson.content, 'base64'))
    } catch (e) {
      return null
    }
    packages[packageJson.path] = _.pick(pkg, [
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
  })

  // returns an Object with all the parsed package.json files:
  //
  // {
  //   "package.json": {},
  //   "backend/package.json": {}
  //   ...
  // }

  return packages
}

module.exports = {
  getFiles,
  formatPackageJson
}
