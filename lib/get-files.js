const _ = require('lodash')
const statsd = require('../lib/statsd')

const githubQueue = require('./github-queue')

const fileList = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock'
]

async function getGithubFile (ghqueue, { path, owner, repo, sha }, log) {
  try {
    statsd.increment('get_github_file_small', { tag: path })
    return await ghqueue.read(github => github.repos.getContents({ path, owner, repo }))
  } catch (error) {
    // Sometimes, the requested blob (eg. package-lock.json) is too large to fetch via the gitHub API,
    // but we can use the Git Data API to request blobs up to 100 MB in size.
    if (error.status === 'too_large') {
      log.info('Could not receive contents from GitHub. File is too, trying the data api for larger files now', { error: error.message })
      statsd.increment('get_github_file_large', { tag: path })
      try {
        const allFiles = await ghqueue.read(github => github.gitdata.getTree({ owner, repo, tree_sha: sha, recursive: 1 }))
        const file = allFiles.tree.find(file => file.path === path)
        const blob = await ghqueue.read(github => github.gitdata.getBlob({ owner, repo, file_sha: file.sha }))

        let name = path
        if (path.includes('/')) name = path.split('/')[1]
        return { name, path, content: blob.content }
      } catch (error) {
        log.info('Could not receive recursive tree from GitHub.', { error: error.message })
        return { name: path, path, content: false }
      }
    } else {
      return { name: path, path, content: false }
    }
  }
}

// Returns an array of objects, where each object describes a `package.json`:
// [{"content": "eyJuYW1lIjoidGVzdCJ9", "name": "package.json", "path": "frontend/package.json", "type": "file"}]
async function discoverPackageFiles ({ installationId, fullName, defaultBranch, log }) {
  const ghqueue = githubQueue(installationId)
  const relevantPackageFilePaths = await discoverPackageFilePaths({ installationId, fullName, defaultBranch, log })
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
async function discoverPackageFilePaths ({ installationId, fullName, defaultBranch, log }) {
  // https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/trees/master?recursive=1
  const [owner, repo] = fullName.split('/')
  const ghqueue = githubQueue(installationId)
  try {
    const result = (await ghqueue.read(github => github.gitdata.getTree({ owner, repo, tree_sha: defaultBranch, recursive: 1 })))
    const filesInRepo = result.tree && result.tree.length ? result.tree : []
    // Construct an array of all relevant package.json paths
    const relevantPackageFilePaths = filesInRepo.map((item) => {
      // Just pick out the paths, eg. `packages/retext-dutch/package.json`
      return item.path
    }).filter((item) => {
      // We don’t want any package.json files from `node_modules`
      return !(item.includes('node_modules') || item.includes('test/') || item.includes('tests/') || item.includes('elm-package.json')) &&
          item.match(/(.+\/package.json$|^package.json$)/)
    })
    log.info('relevant package file paths', { relevantPackageFilePaths })
    return relevantPackageFilePaths
  } catch (error) {
    log.warn(`An error occured when requesting the recursive git-tree of ${defaultBranch}`, { error: error.message })
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

async function getFiles ({ installationId, fullName, files = fileList, sha, log }) {
  // Take the package.json paths and look for the lockfiles too!
  const filesAndLockfiles = files.concat(addRelatedLockfilePaths(files))
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = fullName.split('/')
  const filesRequested = await Promise.all(
    filesAndLockfiles.map((path) => getGithubFile(ghqueue, { path, owner, repo, sha }, log))
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
  let greenkeeperConfigFile = {}
  let parsedConfigFile = {}
  log.info('Fetching greenkeeper.json from GitHub', { path, owner, repo })
  greenkeeperConfigFile = await getGithubFile(ghqueue, { path, owner, repo })
  if (!greenkeeperConfigFile.content) {
    log.info('No greenkeeper.json in repo')
    // return empty object, so job can continue
    return {}
  }

  try {
    parsedConfigFile = JSON.parse(Buffer.from(greenkeeperConfigFile.content, 'base64'))
  } catch (e) {
    log.error('Could not parse greenkeeper.json', { error: e })
    // throw error, so we can raise an issue
    const error = new Error('Could not parse `greenkeeper.json`, it appears to not be a valid JSON file.')
    error.name = 'GKConfigFileParseError'
    throw error
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
