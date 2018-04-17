const _ = require('lodash')
const Log = require('gk-log')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const yaml = require('js-yaml')
const yamlInPlace = require('yml-in-place')
// const escapeRegex = require('escape-string-regexp')
const createBranch = require('../lib/create-branch')
const getConfig = require('../lib/get-config')
module.exports = async function ({ repositoryFullName, nodeVersion, codeName }) {
  console.log('repositoryFullName, nodeVersion, codeName ', repositoryFullName, nodeVersion, codeName)
  // nodeversion = 10
  // codeName = 'whateveron'
  repositoryFullName = repositoryFullName.toLowerCase()
  // find the repository in the database
  const { repositories, installations } = await dbs()
  const repoDoc = _.get(
    await repositories.query('by_full_name', {
      key: repositoryFullName,
      include_docs: true
    }),
    'rows[0].doc'
  )

  if (!repoDoc) {
    const error = new Error(`The repository ${repositoryFullName} does not exist in the database`)
    error.status = 404
    throw error
  }

  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const logs = dbs.getLogsDb()
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'update-nodejs-version'})

  const config = getConfig(repoDoc)
  log.info(`config for ${repoDoc.fullName}`, {config})
  if (config.disabled) {
    log.warn('exited: Greenkeeper is disabled for this repo in package.json')
    return
  }

  // 1. fetch .travis.yml
  async function travisTransform (travisyml) {
    console.log('travisTransform', travisyml)
    try {
      var travis = yaml.safeLoad(travisyml, {
        schema: yaml.FAILSAFE_SCHEMA
      })
      console.log('travis in code', travis)
      console.log('travis in code get', _.get(travis, 'node_js'))
    } catch (e) {
      // ignore .travis.yml if it can not be parsed
      return
    }

    const alreadyHasTargetVersion = false
    if (alreadyHasTargetVersion) return

    travis['node_js'] = nodeVersion
    return yaml.safeDump(travis)
  }

  let transforms = [
    {
      path: '.travis.yml',
      message: `Update to node ${nodeVersion} in .travis.yml`,
      transform: raw => travisTransform(raw)
    }
  ]

  const [owner, repo] = repoDoc.fullName.split('/')

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo })) // wrap in try/catch
  log.info('github: repository info', {repositoryInfo: ghRepo})

  const branch = ghRepo.default_branch
  const newBranch = config.branchPrefix + 'update-to-node-' + nodeVersion

  console.log('installationId', installationId)
  console.log('owner', owner)
  console.log('repo', repo)
  console.log('branch', branch)
  console.log('newBranch', newBranch)
  console.log('transforms', transforms)

  return createBranch({
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  // 2. fetch .nvmrc
  // 3. update all package.jsons
  // Turn all these into commits (via transforms?)
}
