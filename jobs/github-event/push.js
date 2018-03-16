const _ = require('lodash')

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

module.exports = async function (data) {
  const { repositories } = await dbs()
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
  const isMonorepo = !!_.get(config, ['groups'])
  // if greenkeeper.json with at least one file in a group
  // updated repoDoc with new .greenkeeperrc
  //  if a package.json is added/deleted(renamed/moved) in the .greenkeeperrc or the groupname is deleted/changed
  // close all open prs for that groupname

  // Already synced the sha
  if (after === repoDoc.headSha) return
  repoDoc.headSha = after

  // get path of changed package json
  // always put package.jsons in the repoDoc (new & old)
  // if remove event: delete key of package.json
  const oldPkg = _.get(repoDoc, ['packages'])
  await updateRepoDoc(installation.id, repoDoc)
  const pkg = _.get(repoDoc, ['packages'])
  if (!pkg || _.isEmpty(pkg)) return disableRepo({ repositories, repository, repoDoc })
  if (!isMonorepo) { // does this make sense??
    if (!Object.keys(pkg).length) {
      return disableRepo({ repositories, repository, repoDoc })
    }
  }

  // check if there are changes in packag.json files or the greenkeeper config
  if (_.isEqual(oldPkg, pkg) && _.isEqual(config, repoDoc.greenkeeper)) {
    await updateDoc(repositories, repository, repoDoc)
    return null
  }

  await updateDoc(repositories, repository, repoDoc)

  if (!oldPkg) {
    return {
      data: {
        name: 'create-initial-branch',
        repositoryId,
        accountId: repoDoc.accountId
      }
    }
  }

  // needs to happen for all the package.jsons
  // delete all branches for modified or deleted dependencies
  // do diff + getBranchesToDelete per file for each group

  // TODO: for Tuesday -> deleting a package.json needs to be detected!!
  const branches = await getDependencyBranchesForAllGroups({pkg, oldPkg, config, repositories, repositoryId})
  const configChanges = diffGreenkeeperJson(config, repoDoc.greenkeeper)

  const groupBranchesToDelete = await getGroupBranchesToDelete({configChanges, repositories, repositoryId})
  const allBranchesToDelete = branches.concat(groupBranchesToDelete)
  const _branches = _.uniqWith(_.flattenDeep(allBranchesToDelete), _.isEqual)

  await Promise.mapSeries(
    _branches,
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
    const groupsToRecvieveInitialBranch = configChanges.added.concat(relevantModifiedGroups)
    if (_.isEmpty(groupsToRecvieveInitialBranch)) return
    // create subgroup initial pr
    return _(groupsToRecvieveInitialBranch)
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

  // do this per group, if groups, else once

  // MONDAY CONTINUE HERE

  // TODO: config includes no groups
  // console.log('config', config)
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

async function disableRepo ({ repositories, repoDoc, repository }) {
  repoDoc.enabled = false
  await updateDoc(repositories, repository, repoDoc)
  if (!env.IS_ENTERPRISE) {
    return maybeUpdatePaymentsJob(repoDoc.accountId, repoDoc.private)
  }
}

async function getDependencyBranchesForAllGroups ({pkg, oldPkg, config, repositories, repositoryId}) {
  return Promise.all(Object.keys(pkg).map(async (path) => {
    let groupName = null
    if (config.groups) {
      Object.keys(config.groups).map((group) => {
        if (config.groups[group].packages.includes(path)) {
          groupName = group
        }
      })
    }
   // this can only happen if a package.json was modified
    const dependencyDiff = diff(oldPkg[path], pkg[path], groupName)
    if (!_.isEmpty(dependencyDiff)) {
      return getDependencyBranchesToDelete({changes: dependencyDiff, repositories, repositoryId, config})
    }
    return []
  }))
}
