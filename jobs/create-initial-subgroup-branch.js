const Log = require('gk-log')
const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const { promisify } = require('bluebird')
const RegClient = require('../lib/npm-registry-client')
const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const createBranch = require('../lib/create-branch')
const { updateRepoDoc } = require('../lib/repository-docs')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const { getUpdatedDependenciesForFiles } = require('../utils/initial-branch-utils')
const { getGroupBranchesToDelete } = require('../lib/branches-to-delete')
const deleteBranches = require('../lib/delete-branches')

// If we update dependencies, find any open PRs for that dependency and close the PRs by commit message

module.exports = async function ({ repositoryId, groupName }) {
  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const repoDoc = await repositories.get(repositoryId)
  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-initial-subgroup-branch'})

  log.info('started')

  // delete existing initial subgroup branches
  const configChanges = { added: [], removed: [], modified: [groupName] }
  const groupBranchesToDelete = _.flatten(await getGroupBranchesToDelete({configChanges, repositories, repositoryId}))
  if (groupBranchesToDelete && groupBranchesToDelete.length) {
    await Promise.mapSeries(
      groupBranchesToDelete,
      deleteBranches.bind(null, {
        installationId,
        fullName: repoDoc.fullName,
        repositoryId
      })
    )
  }

  await updateRepoDoc({installationId, doc: repoDoc, log})
  const config = getConfig(repoDoc)
  const pathsForGroup = config.groups[groupName].packages
  if (_.isEmpty(pathsForGroup)) {
    log.warn(`exited: No packages and package.json found for group: ${groupName}`)
    return
  }

  const packageJsonFiles = _.get(repoDoc, ['packages'])
  if (_.isEmpty(packageJsonFiles)) {
    log.warn(`exited: No package.json files found`)
    return
  }
  await upsert(repositories, repoDoc._id, repoDoc)

  const [owner, repo] = repoDoc.fullName.split('/')

  const registry = RegClient()
  const registryGet = promisify(registry.get.bind(registry))
  // collate ignored dependencies from greenkeeper.json and this group’s config.
  const ignore = _([..._.get(config, 'ignore', []), ..._.get(config, `groups.${groupName}.ignore`, [])]).filter(Boolean).uniq().value()

  // Get all package.jsons in this group and update every package the newest version
  const dependencies = await getUpdatedDependenciesForFiles({
    packagePaths: pathsForGroup,
    packageJsonContents: packageJsonFiles,
    registryGet,
    ignore,
    log
  })

  if (dependencies.length === 0) return

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo })) // wrap in try/catch
  log.info('github: repository info', {repositoryInfo: ghRepo})

  const branch = ghRepo.default_branch

  const newBranch = config.branchPrefix + 'initial' + `-${groupName}`

  let depsUpdated = false // this is ugly but works ¯\_(ツ)_/¯
  // create a transform loop for all the package.json paths and push into the transforms array below
  const transforms = pathsForGroup.map(path => {
    return {
      path,
      message: 'chore(package): update dependencies',
      transform: oldPkg => {
        const oldPkgParsed = JSON.parse(oldPkg)
        const inplace = jsonInPlace(oldPkg)

        dependencies.forEach(({ type, name, newVersion }) => {
          if (!_.get(oldPkgParsed, [type, name])) return
          depsUpdated = true
          inplace.set([type, name], newVersion)
        })
        return inplace.toString()
      }
    }
  })

  const sha = await createBranch({ // try/catch
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  if (!depsUpdated) {
    log.info('exited: no dependencies updated', { transforms })
    return
  }
  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    repositoryId,
    initial: false,
    subgroupInitial: true,
    sha,
    base: branch,
    head: newBranch,
    processed: false,
    depsUpdated
  })

  log.success('success')
}
