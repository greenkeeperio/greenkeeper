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

// Returns an array of objects, where each object describes a `package.json`:
// [{"content": "eyJuYW1lIjoidGVzdCJ9", "name": "package.json", "path": "frontend/package.json", "type": "file"}]
async function discoverPackageFiles (installationId, fullName) {
  const ghqueue = githubQueue(installationId)
  const relevantPackageFilePaths = await discoverPackageFilePaths(installationId, fullName)
  const [owner, repo] = fullName.split('/')
  // Fetch the content for each relevant package.json file
  const packageFiles = await Promise.all(
    relevantPackageFilePaths.map((path) => getGithubFile(ghqueue, { path, owner, repo }))
  )
  return packageFiles
}

// Returns an array of paths of `package.json` files:
// [ 'package.json', 'frontend/package.json', 'backend/package.json' ]
async function discoverPackageFilePaths (installationId, fullName) {
  const query = `filename:package.json+repo:${fullName}`
  const ghqueue = githubQueue(installationId)
  const packageFilePaths = (await ghqueue.read(github => github.search.code({q: query, per_page: 100})))
  // Construct an array of all relevant package.json paths
  const relevantPackageFilePaths = packageFilePaths.items.map((item) => {
    // Just pick out the paths, eg. `packages/retext-dutch/package.json`
    return item.path
  }).filter((item) => {
    // We don’t want any package.json files from `node_modules`
    return !item.includes('node_modules')
  })
  return relevantPackageFilePaths
}

function addRelatedLockfilePaths (files) {
  if (_.isEmpty(files)) return fileList
  if (_.isEmpty(_.difference(files, fileList))) return []
  let relatedLockfilePaths = []
  files.map(path => {
    relatedLockfilePaths.push(path.replace('package.json', 'package-lock.json'))
    relatedLockfilePaths.push(path.replace('package.json', 'yarn.lock'))
    relatedLockfilePaths.push(path.replace('package.json', 'npm-shrinkwrap.json'))
  })
  return relatedLockfilePaths
}

async function getFiles (installationId, fullName, files = fileList) {
  // Take the package.json paths and look for the lockfiles too!
  const filesAndLockfiles = files.concat(addRelatedLockfilePaths(files))
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = fullName.split('/')
  const filesRequested = await Promise.all(
    filesAndLockfiles.map((path) => getGithubFile(ghqueue, { path, owner, repo }))
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

  const groupedFiles = _.groupBy(filesRequested, file => file.name)
  return _.pick(groupedFiles, fileList)
}

async function getGreenkeeperConfigFile (installationId, fullName) {
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = fullName.split('/')
  const path = 'greenkeeper.json'
  let parsedConfigFile = {}
  try {
    const greenkeeperConfigFile = await getGithubFile(ghqueue, { path, owner, repo })
    try {
      parsedConfigFile = JSON.parse(Buffer.from(greenkeeperConfigFile.content, 'base64'))
    } catch (e) {}
  } catch (e) {}

  return parsedConfigFile
}

function getPackagePathsFromConfigFile (configFile) {
  if (_.isEmpty(configFile)) return null
  let pathList = []
  const groups = configFile.groups
  if (_.isEmpty(groups)) return null
  pathList = _.flatten(Object.keys(groups).map(group => groups[group].packages))

  return pathList
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
  formatPackageJson,
  discoverPackageFiles,
  discoverPackageFilePaths,
  getGreenkeeperConfigFile,
  getPackagePathsFromConfigFile
}
