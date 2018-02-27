const _ = require('lodash')

const dbs = require('../../lib/dbs')
const env = require('../../lib/env')
const { updateRepoDoc } = require('../../lib/repository-docs')
const updatedAt = require('../../lib/updated-at')
const diff = require('../../lib/diff-package-json')
const deleteBranches = require('../../lib/delete-branches')
const { maybeUpdatePaymentsJob } = require('../../lib/payments')

module.exports = async function (data) {
  const { repositories } = await dbs()
  const { after, repository, installation } = data

  const branchRef = `refs/heads/${repository.default_branch}`
  if (!data.head_commit || data.ref !== branchRef) return

// add .greenkeeperrc
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

  let repodoc = await repositories.get(repositoryId)

  // Already synced the sha
  if (after === repodoc.headSha) return
  repodoc.headSha = after

  // get path of changed package json
  // always put package.jsons in the repoDoc (new & old)
  // if remove event: delete key of package.json
  const oldPkg = _.get(repodoc, ['packages', 'package.json'])
  await updateRepoDoc(installation.id, repodoc)
  const pkg = _.get(repodoc, ['packages', 'package.json'])

  if (!pkg) return disableRepo({ repositories, repository, repodoc })

  if (_.isEqual(oldPkg, pkg)) return updateDoc(repositories, repository, repodoc)

  const disabled = _.get(pkg, ['greenkeeper', 'disabled'])
  if (disabled) return disableRepo({ repositories, repository, repodoc })

  await updateDoc(repositories, repository, repodoc)

  const wasDisabled = _.get(oldPkg, ['greenkeeper', 'disabled'])
  if (!oldPkg || wasDisabled) {
    return {
      data: {
        name: 'create-initial-branch',
        repositoryId,
        accountId: repodoc.accountId
      }
    }
  }

// needs to happen for all the package.jsons
// delete all branches for modified or deleted dependencies
  const changes = diff(oldPkg, pkg)

  const branches = []
  _.each(changes, (type, dependencyType) => {
    _.each(type, (dep, dependency) => {
      if (dep.change === 'added') return
      branches.push(
        Object.assign(
          {
            dependency,
            dependencyType
          },
          dep
        )
      )
    })
  })
  await Promise.mapSeries(
    branches,
    deleteBranches.bind(null, {
      installationId: installation.id,
      fullName: repository.full_name,
      repositoryId
    })
  )
}

function updateDoc (repositories, repository, repodoc) {
  return repositories.put(
    updatedAt(
      Object.assign(repodoc, {
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

async function disableRepo ({ repositories, repodoc, repository }) {
  repodoc.enabled = false
  await updateDoc(repositories, repository, repodoc)
  if (!env.IS_ENTERPRISE) {
    return maybeUpdatePaymentsJob(repodoc.accountId, repodoc.private)
  }
}
