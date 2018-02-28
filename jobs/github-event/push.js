const _ = require('lodash')

const dbs = require('../../lib/dbs')
const env = require('../../lib/env')
const { updateRepoDoc } = require('../../lib/repository-docs')
const updatedAt = require('../../lib/updated-at')
const diff = require('../../lib/diff-package-json')
const deleteBranches = require('../../lib/delete-branches')
const { maybeUpdatePaymentsJob } = require('../../lib/payments')
const { cleanUpBranches } = require('../../lib/cleanup-branches')

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

  // if .greenkeeperrc
  // updated repoDoc with new .greenkeeperrc
  //  if a package.json is added/deleted(renamed/moved) in the .greenkeeperrc or the groupname is deleted/changed
  // close all open prs for that groupname

  if (!hasRelevantChanges(data.commits, relevantFiles)) return
  const repositoryId = String(repository.id)

  let repoDoc = await repositories.get(repositoryId)

  // Already synced the sha
  if (after === repoDoc.headSha) return
  repoDoc.headSha = after

  // get path of changed package json
  // always put package.jsons in the repoDoc (new & old)
  // if remove event: delete key of package.json
  const oldPkg = _.get(repoDoc, ['packages'])
  await updateRepoDoc(installation.id, repoDoc)
  const pkg = _.get(repoDoc, ['packages'])

  if (!pkg) return disableRepo({ repositories, repository, repoDoc })

  if (_.isEqual(oldPkg, pkg)) {
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
  console.log('oldPkg', oldPkg)
  console.log('pkg', pkg)

  const changes = diff(oldPkg, pkg)
  console.log('changes', changes)

  const branches = cleanUpBranches(changes)
  console.log('branches to be deleted!!', branches)
  await Promise.mapSeries(
    branches,
    deleteBranches.bind(null, {
      installationId: installation.id,
      fullName: repository.full_name,
      repositoryId
    })
  )
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

// check for relevant files in all folders!
// currently we might just detect those files in the root directory
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
  console.log('disableRepo')
  repoDoc.enabled = false
  await updateDoc(repositories, repository, repoDoc)
  if (!env.IS_ENTERPRISE) {
    return maybeUpdatePaymentsJob(repoDoc.accountId, repoDoc.private)
  }
}
