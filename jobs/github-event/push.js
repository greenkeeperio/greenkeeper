const _ = require('lodash')
const Log = require('gk-log')

const dbs = require('../../lib/dbs')
const env = require('../../lib/env')
const { updateRepoDoc } = require('../../lib/repository-docs')
const updatedAt = require('../../lib/updated-at')
const diff = require('../../lib/diff-package-json')
const diffGreenkeeperJson = require('../../lib/diff-greenkeeper-json')
const deleteBranches = require('../../lib/delete-branches')
const { maybeUpdatePaymentsJob } = require('../../lib/payments')
const {
  getDependencyBranchesToDelete,
  getGroupBranchesToDelete
} = require('../../lib/branches-to-delete')
const getConfig = require('../../lib/get-config')
const { validate } = require('../../lib/validate-greenkeeper-json')

module.exports = async function (data) {
  const { repositories, logs } = await dbs()
  const { after, repository, installation } = data

  const branchRef = `refs/heads/${repository.default_branch}`
  if (!data.head_commit || data.ref !== branchRef) return

  const relevantFiles = [
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'greenkeeper.json'
  ]

  if (!hasRelevantChanges(data.commits, relevantFiles)) return

  const repositoryId = String(repository.id)
  let repoDoc = await repositories.get(repositoryId)

  const config = getConfig(repoDoc)
  const log = Log({logsDb: logs, accountId: repoDoc.accountId, repoSlug: repoDoc.fullName, context: 'push'})
  log.info('started')
  /*
  1. Update repoDoc with new greenkeeper.json
  2. If a package.json is added/deleted(renamed/moved) in the .greenkeeperrc or the groupname is deleted/changed close all open prs for that groupname
  3. If greenkeeper.json is invalid, continue using the previous version and open an issue concerning the invalid file
  */

  // Don’t handle this change twice
  if (after === repoDoc.headSha) {
    log.info('exited: already handled this change')
    return
  }
  repoDoc.headSha = after

  // get path of changed package json
  // always put package.jsons in the repoDoc (new & old)
  // if remove event: delete key of package.json
  const oldPkg = _.get(repoDoc, ['packages'])
  await updateRepoDoc({installationId: installation.id, doc: repoDoc, log})
  const pkg = _.get(repoDoc, ['packages'])
  if (_.isEmpty(pkg)) {
    log.warn('disabling repository')
    return disableRepo({ repositories, repository, repoDoc })
  }

  if (hasRelevantConfigFileChanges(data.commits)) {
    const configValidation = validate(repoDoc.greenkeeper)
    if (configValidation.error) {
      log.warn('validation of greenkeeper.json failed', {error: configValidation.error.details, greenkeeperJson: repoDoc.greenkeeper})
      // reset greenkeeper.json and add error-job
      _.set(repoDoc, ['greenkeeper'], config)
      await updateDoc(repositories, repository, repoDoc)
      return {
        data: {
          name: 'invalid-config-file',
          message: configValidation.error.details[0].message,
          errors: configValidation.error.details,
          repositoryId,
          accountId: repoDoc.accountId
        }
      }
    }
  }

  // if there are no changes in packag.json files or the greenkeeper config
  if (_.isEqual(oldPkg, pkg) && _.isEqual(config, repoDoc.greenkeeper)) {
    log.info('there are no changes in packag.json files or the greenkeeper config')
    await updateDoc(repositories, repository, repoDoc)
    return null
  }

  // if greenkeeper config was deleted but only contained the root package.json
  // there is no need to delete the branches
  if (
    _.isEqual(oldPkg, pkg) &&
    Object.keys(pkg).length === 1 &&
    (!_.isEmpty(config) && _.isEmpty(repoDoc.greenkeeper))
  ) {
    log.info('greenkeeper config was deleted but only contained the root package.json')
    await updateDoc(repositories, repository, repoDoc)
    return null
  }

  await updateDoc(repositories, repository, repoDoc)

  if (!oldPkg) {
    log.success('starting create-initial-branch')
    return {
      data: {
        name: 'create-initial-branch',
        repositoryId,
        accountId: repoDoc.accountId
      }
    }
  }

  // Delete all branches for modified or deleted dependencies
  // Do diff + getBranchesToDelete per file for each group
  // Get all dependency branches, grouped or not
  const dependencyBranches = await getDependencyBranchesForAllGroups({pkg, oldPkg, config, repositories, repositoryId})
  const configChanges = diffGreenkeeperJson(config, repoDoc.greenkeeper)
  // If groups have been deleted or modified, find the branches we need to delete
  const groupBranchesToDelete = await getGroupBranchesToDelete({configChanges, repositories, repositoryId})
  // Mash everything together
  const allBranchesToDelete = dependencyBranches.concat(groupBranchesToDelete)
  // De-dupe and flatten branches
  const actualBranchesToDelete = _.uniqWith(_.flattenDeep(allBranchesToDelete), _.isEqual)

  log.info('starting to delete branches', {branches: actualBranchesToDelete.map(branch => branch.head)})
  await Promise.mapSeries(
    actualBranchesToDelete,
    deleteBranches.bind(null, {
      installationId: installation.id,
      fullName: repository.full_name,
      repositoryId
    })
  )

  if (configChanges.added.length || configChanges.modified.length) {
    const relevantModifiedGroups = configChanges.modified.filter((group) => {
      if (!_.isEmpty(_.difference(repoDoc.greenkeeper.groups[group].packages, config.groups[group].packages))) {
        return true
      }
    })
    const groupsToReceiveInitialBranch = configChanges.added.concat(relevantModifiedGroups)
    log.success(`${groupsToReceiveInitialBranch.length} groups to receive initial subgroup branch`, {groupsToReceiveInitialBranch})
    if (_.isEmpty(groupsToReceiveInitialBranch)) return
    // create subgroup initial pr
    return _(groupsToReceiveInitialBranch)
      .map(groupName => ({
        data: {
          name: 'create-initial-subgroup-branch',
          repositoryId,
          accountId: repoDoc.accountId,
          groupName
        }
      }))
      .value()
  }
  log.success('success')
}

function updateDoc (repositories, repository, repoDoc) {
  return repositories.put(
    updatedAt(
      Object.assign(repoDoc, {
        private: repository.private,
        fullName: repository.full_name,
        fork: repository.fork,
        hasIssues: repository.has_issues
      })
    )
  )
}

function hasRelevantChanges (commits, files) {
  return _.some(files, file => {
    return _.some(['added', 'removed', 'modified'], changeType => {
      return _.some(commits, commit => {
        return _.some(commit[changeType], (path) => {
          return path.includes(file)
        })
      })
    })
  })
}

function hasRelevantConfigFileChanges (commits) {
  return _.some(commits, commit => {
    return _.some(['added', 'modified'], changeType => {
      return _.some(commit[changeType], (path) => {
        return path.includes('greenkeeper.json')
      })
    })
  })
}

async function disableRepo ({ repositories, repoDoc, repository }) {
  repoDoc.enabled = false
  await updateDoc(repositories, repository, repoDoc)
  if (!env.IS_ENTERPRISE) {
    return maybeUpdatePaymentsJob(repoDoc.accountId, repoDoc.private)
  }
}

async function getDependencyBranchesForAllGroups ({pkg, oldPkg, config, repositories, repositoryId}) {
  return Promise.all(Object.keys(pkg).map(async (path) => {
    // Find the group name for the current package json
    let groupName = null
    if (config.groups) {
      Object.keys(config.groups).map((group) => {
        if (config.groups[group].packages.includes(path)) {
          groupName = group
        }
      })
    }
    const dependencyDiff = diff(oldPkg[path], pkg[path], groupName)
    if (!_.isEmpty(dependencyDiff)) {
      // If the package.json has changes, find the proper (group) branches to delete
      return getDependencyBranchesToDelete({changes: dependencyDiff, repositories, repositoryId, config})
    }
    return []
  }))
}
