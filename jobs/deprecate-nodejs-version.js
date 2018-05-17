const _ = require('lodash')
const Log = require('gk-log')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const yaml = require('js-yaml')
const jsonInPlace = require('json-in-place')
const createBranch = require('../lib/create-branch')
const getConfig = require('../lib/get-config')
const {
  hasNodeVersion,
  getNodeVersionIndex,
  getNodeVersionsFromTravisYML,
  updateNodeVersionToNvmrc,
  addNewLowestAndDeprecate
} = require('../utils/utils')
const upsert = require('../lib/upsert')
const issueContent = require('../content/nodejs-deprecate-issue')

module.exports = async function ({ repositoryFullName, nodeVersion, codeName, newLowestVersion, newLowestCodeName, announcementURL }) {
  nodeVersion = nodeVersion.toString()
  newLowestVersion = newLowestVersion.toString()
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
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'deprecate-nodejs-version'})

  const existingBranches = await repositories.query('branch_by_dependency', {
    key: [repositoryId, `node-${nodeVersion}`, 'node-deprecation'],
    include_docs: false
  })

  if (existingBranches && existingBranches.rows.length !== 0) {
    log.warn(`exited: branchDoc for deprecation of ${nodeVersion} already exists`, existingBranches.rows[0])
    return
  }

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
    if (!hasNodeVersion) return
    const updatedTravisYaml = addNewLowestAndDeprecate({
      travisYML,
      nodeVersion,
      codeName,
      newLowestVersion,
      newLowestCodeName
    })
    return updatedTravisYaml
  }

  function nvmrcTransform (nvmrc) {
    if (!nvmrc) return nvmrc
    if (hasNodeVersion(nvmrc, nodeVersion, codeName)) return nvmrc

    const updatedNvmrc = updateNodeVersionToNvmrc(newLowestVersion)
    return updatedNvmrc
  }

  let transforms = [
    {
      path: '.travis.yml',
      message: `Deprecate Node.js ${nodeVersion} in .travis.yml

BREAKING CHANGE: This module no longer supports Node.js ${nodeVersion}`,
      transform: raw => travisTransform(raw)
    },
    {
      path: '.nvmrc',
      message: `Deprecate Node.js ${nodeVersion} in .nvmrc

BREAKING CHANGE: This module no longer supports Node.js ${nodeVersion}`,
      transform: raw => nvmrcTransform(raw)
    }
  ]

  const packageJsonContents = _.get(repoDoc, ['packages'])
  const packagePaths = _.keys(packageJsonContents)

  let engineTransformMessages = {
    updated: 0
  }

  // Check and possibly update all package.jsons
  packagePaths.map((packagePath) => {
    transforms.push({
      path: packagePath,
      message: `Deprecate Node.js ${nodeVersion} in engines in ${packagePath}

BREAKING CHANGE: This module no longer supports Node.js ${nodeVersion}`,
      transform: oldPkg => {
        const oldPkgParsed = JSON.parse(oldPkg)
        const inplace = jsonInPlace(oldPkg)
        const currentEngines = _.get(oldPkgParsed, 'engines.node')
        const newEngines = currentEngines.replace(RegExp(`^(>|>=|~|v)?(${nodeVersion})`, 'g'), `$1${newLowestVersion}`)
        if (newEngines === currentEngines) return
        inplace.set('engines.node', newEngines)
        engineTransformMessages.updated++
        return inplace.toString()
      }
    })
  })

  const [owner, repo] = repoDoc.fullName.split('/')

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo })) // wrap in try/catch
  log.info('github: repository info', {repositoryInfo: ghRepo})

  const branch = ghRepo.default_branch
  const newBranch = branchPrefix + 'deprecate-node-' + nodeVersion

  const sha = await createBranch({ // try/catch
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  if (sha) {
    log.info('Created branch for node deprecation')
    const travisModified = transforms[0].created
    const nvmrcModified = transforms[1].created

    const branchData = {
      type: 'branch',
      initial: false,
      sha,
      base: branch,
      head: newBranch,
      processed: false,
      travisModified,
      nvmrcModified,
      engineTransformMessages,
      repositoryId,
      dependency: `node-${nodeVersion}`,
      dependencyType: 'node-deprecation'
    }

    log.info('Creating branch doc', branchData)
    await upsert(repositories, `${repositoryId}:branch:${sha}`, branchData)

    // 4. Write issue and save issue doc
    const body = issueContent({
      owner,
      repo,
      base: branch,
      head: newBranch,
      nodeVersion,
      codeName,
      newLowestVersion,
      newLowestCodeName,
      travisModified,
      nvmrcModified,
      engineTransformMessages,
      announcementURL
    })
    const { number } = await githubQueue(installationId).write(github => github.issues.create({
      owner,
      repo,
      title: `Version ${nodeVersion} of node.js has been deprecated`,
      body,
      labels: [label]
    }))

    await upsert(repositories, `${repositoryId}:issue:${number}`, {
      type: 'issue',
      repositoryId,
      number,
      state: 'open',
      dependency: `node-${nodeVersion}`,
      dependencyType: 'node-deprecation'
    })
  }
}
