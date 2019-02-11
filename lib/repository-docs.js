const _ = require('lodash')
const crypto = require('crypto')

const updatedAt = require('./updated-at')
const {
  getFiles,
  formatPackageJson,
  getGreenkeeperConfigFile,
  getPackagePathsFromConfigFile
} = require('./get-files')
const { validate } = require('./validate-greenkeeper-json')

module.exports = {
  createDocs,
  updateRepoDoc
}

// trigger (several) initial-subgroup-pr(s):
// - if a package.json is added/renamed/moved in the greenkeeper.json
// - if a greenkeeper.json is added

async function updateRepoDoc ({ installationId, doc, filePaths, log }) {
  const fullName = doc.fullName
  const oldGreenkeeperConfig = doc.greenkeeper
  // set a default empty config so the job can continue if the file get fails for some reason
  let greenkeeperConfigFile = {}
  try {
    greenkeeperConfigFile = await getGreenkeeperConfigFile(installationId, fullName, log)
  } catch (e) {
    throw e
  } finally {
    if (!_.isEmpty(greenkeeperConfigFile)) {
      log.info('UpdateRepoDoc: Fetched greenkeeper.json from GitHub', greenkeeperConfigFile)
    }
    _.set(doc, ['greenkeeper'], greenkeeperConfigFile)
    const defaultFiles = {
      'package.json': [],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    let filePathsFromConfig = []

    if (!_.isEmpty(greenkeeperConfigFile)) {
      if (validate(greenkeeperConfigFile).error) {
        log.info('UpdateRepoDoc: setting file paths to the ones from the old greenkeeper.json')
        filePathsFromConfig = getPackagePathsFromConfigFile(oldGreenkeeperConfig)
      } else {
        log.info('UpdateRepoDoc: setting file paths to the ones found via greenkeeper.json')
        filePathsFromConfig = getPackagePathsFromConfigFile(greenkeeperConfigFile)
      }
    }

    // try to get file paths from either the autodiscovered filePaths
    // or from the greenkeeper.json
    if (!_.isEmpty(filePaths)) {
      log.info('UpdateRepoDoc: setting file paths to the ones found per autodiscovery')
      filePathsFromConfig = getPackagePathsFromConfigFile({ groups: { default: { packages: filePaths } } })
    }
    log.info('UpdateRepoDoc: requesting files from GitHub', { files: filePathsFromConfig })
    const filesFromConfig = _.isEmpty(filePathsFromConfig)
      ? await getFiles({ installationId, fullName, sha: doc.headSha, log })
      : await getFiles({ installationId, fullName, files: filePathsFromConfig, sha: doc.headSha, log })

    const files = _.merge(filesFromConfig, defaultFiles)
    // handles multiple paths for files like this:
    // files: {
    //   package.json: ['package.json', 'backend/package.json', 'frontend/package.json']
    //   package-lock.json: ['package-lock.json', 'backend/package-lock.json']
    //   npm-shrinkwrap.json: [],
    //   yarn.lock: []
    // }
    doc.files = _.mapValues(files, fileType => fileType
      .filter(file => !!file.content)
      .map(file => file.path))

    // formats *all* the package.json files
    const pkg = formatPackageJson(files['package.json'])

    if (!pkg) {
      _.unset(doc, ['packages'])
    } else {
      _.set(doc, ['packages'], pkg)
    }

    log.info('UpdateRepoDoc: doc updated', { doc })
  }
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
