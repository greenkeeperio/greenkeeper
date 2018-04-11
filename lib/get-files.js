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
async function discoverPackageFiles ({installationId, fullName, defaultBranch, log}) {
  const ghqueue = githubQueue(installationId)
  const relevantPackageFilePaths = await discoverPackageFilePaths({installationId, fullName, defaultBranch, log})
  const [owner, repo] = fullName.split('/')
  // Fetch the content for each relevant package.json file
  const packageFiles = await Promise.all(
    relevantPackageFilePaths.map((path) => getGithubFile(ghqueue, { path, owner, repo }))
  )

  log.info(`got ${packageFiles.length} package.json files`)
  return packageFiles
}

// Returns an array of paths of `package.json` files:
// [ 'package.json', 'frontend/package.json', 'backend/package.json' ]
async function discoverPackageFilePaths ({installationId, fullName, defaultBranch, log}) {
  // https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/trees/master?recursive=true
  const [owner, repo] = fullName.split('/')
  const ghqueue = githubQueue(installationId)
  try {
    const result = (await ghqueue.read(github => github.gitdata.getTree({owner, repo, sha: defaultBranch, recursive: true})))
    const filesInRepo = result.tree && result.tree.length ? result.tree : []
    // Construct an array of all relevant package.json paths
    const relevantPackageFilePaths = filesInRepo.map((item) => {
      // Just pick out the paths, eg. `packages/retext-dutch/package.json`
      return item.path
    }).filter((item) => {
      // We don’t want any package.json files from `node_modules`
      return !item.includes('node_modules') && item.includes('package.json')
    })
    log.info('relevant package file paths', {relevantPackageFilePaths})
    return relevantPackageFilePaths
  } catch (e) {
    log.warn(`An error occured when requesting the recursive git-tree of ${defaultBranch}`, {error: e})
    return []
  }
}

function addRelatedLockfilePaths (files) {
  // return standard file list
  if (_.isEmpty(files) || files === ['package.json']) return fileList
  // nothing to add
  if (_.isEqual(fileList, files)) return []
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

async function getGreenkeeperConfigFile (installationId, fullName, log = console) {
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = fullName.split('/')
  const path = 'greenkeeper.json'
  let parsedConfigFile = {}
  log.info('Fetching greenkeeper.json from GitHub', {path, owner, repo})
  try {
    const greenkeeperConfigFile = await getGithubFile(ghqueue, { path, owner, repo })
    try {
      parsedConfigFile = JSON.parse(Buffer.from(greenkeeperConfigFile.content, 'base64'))
    } catch (e) {
      log.error('Could not parse greenkeeper.json', {error: e})
      // throw error, so we can raise an issue
      const error = new Error('could not parse greenkeeper.json')
      error.name = 'GKConfigFileParseError'
      throw error
    }
  } catch (e) {
    if (e.code === 404) {
      log.error('No greenkeeper.json in repo')
      // return empty object, so job can continue
      return {}
    }
    log.error('Could not get greenkeeper.json from GitHub', {error: e})
    // return empty object, so job can continue
    return {}
  }

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
