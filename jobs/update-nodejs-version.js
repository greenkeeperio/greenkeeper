const _ = require('lodash')
const Log = require('gk-log')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const yaml = require('js-yaml')
const createBranch = require('../lib/create-branch')
const getConfig = require('../lib/get-config')
const { getNodeVersionIndex, getNodeVersionsFromTravisYML, addNodeVersionToTravisYML } = require('../utils/utils')
const upsert = require('../lib/upsert')
const issueContent = require('../content/nodejs-release-issue')

module.exports = async function ({ repositoryFullName, nodeVersion, codeName }) {
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

  const repositoryId = _.get(repoDoc, '_id')

  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const logs = dbs.getLogsDb()
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'update-nodejs-version'})

  const config = getConfig(repoDoc)
  const { branchPrefix, label } = config
  log.info(`config for ${repoDoc.fullName}`, {config})
  if (config.disabled) {
    log.warn('exited: Greenkeeper is disabled for this repo in package.json')
    return
  }

  // 1. fetch .travis.yml
  function travisTransform (travisYML) {
    try {
      var travisJSON = yaml.safeLoad(travisYML, {
        schema: yaml.FAILSAFE_SCHEMA
      })
    } catch (e) {
      // ignore .travis.yml if it can not be parsed
      return
    }
    // No versions specified in travis YML
    if (!_.get(travisJSON, 'node_js')) return

    const nodeVersionFromYaml = getNodeVersionsFromTravisYML(travisYML)
    const hasNodeVersion = getNodeVersionIndex(nodeVersionFromYaml.versions, nodeVersion, codeName) !== -1
    if (hasNodeVersion) return

    const updatedTravisYaml = addNodeVersionToTravisYML(travisYML, nodeVersion, codeName, nodeVersionFromYaml)
    return updatedTravisYaml
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
  const newBranch = branchPrefix + 'update-to-node-' + nodeVersion

  const sha = await createBranch({ // try/catch
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  if (sha) {
    const travisModified = transforms[0].created
    const nvmrcModified = false
    const packageJsonModified = false
    await upsert(repositories, `${repositoryId}:branch:${sha}`, {
      type: 'branch',
      initial: false,
      sha,
      base: branch,
      head: newBranch,
      processed: false,
      travisModified
    })

    // 4. Write issue and save issue doc
    const body = issueContent({
      owner,
      repo,
      base: branch,
      head: newBranch,
      nodeVersion,
      codeName,
      travisModified,
      nvmrcModified,
      packageJsonModified
    })
    const { number } = await githubQueue(installationId).write(github => github.issues.create({
      owner,
      repo,
      title: `Version ${nodeVersion} of node.js has been released`,
      body,
      labels: [label]
    }))

    await upsert(repositories, `${repositoryId}:issue:${number}`, {
      type: 'issue',
      repositoryId,
      number,
      state: 'open'
    })
  }

  // 2. fetch .nvmrc
  // 3. update all package.jsons
}
