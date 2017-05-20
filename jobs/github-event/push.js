const _ = require('lodash')

const getToken = require('../../lib/get-token')
const GitHub = require('../../lib/github')
const dbs = require('../../lib/dbs')
const { readPackageJson } = require('../../lib/repository-docs')
const updatedAt = require('../../lib/updated-at')
const diff = require('../../lib/diff-package-json')
const deleteBranches = require('../../lib/delete-branches')

module.exports = async function (data) {
  const { repositories } = await dbs()
  const { after, repository, installation } = data

  // No change on the default branch
  if (
    !data.head_commit || data.ref !== `refs/heads/${repository.default_branch}`
  ) {
    return
  }

  const pkgAdded = _.some(data.commits, c => {
    return _.includes(c.added, 'package.json')
  })

  const pkgRemoved = _.some(data.commits, c => {
    return _.includes(c.removed, 'package.json')
  })

  const pkgModified = _.some(data.commits, c => {
    return _.includes(c.modified, 'package.json')
  })

  // No changes to package.json
  if (!pkgAdded && !pkgRemoved && !pkgModified) return

  const repositoryId = String(repository.id)

  let repodoc = await repositories.get(repositoryId)

  // Already synced the sha
  if (after === repodoc.headSha) return
  repodoc.headSha = after

  if (pkgRemoved) {
    _.unset(repodoc, ['packages', 'package.json'])
    return disableRepo({ repositories, repository, repodoc })
  }

  const { token } = await getToken(installation.id)

  const github = GitHub()
  github.authenticate({ type: 'token', token })

  const pkg = await readPackageJson(github, repository.full_name)

  if (!pkg) {
    _.unset(repodoc, ['packages', 'package.json'])
    return disableRepo({ repositories, repository, repodoc })
  }

  const oldPkg = _.get(repodoc, ['packages', 'package.json'])

  if (_.isEqual(oldPkg, pkg)) return

  _.set(repodoc, ['packages', 'package.json'], pkg)

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
      github,
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

async function disableRepo ({ repositories, repodoc, repository }) {
  repodoc.enabled = false
  await updateDoc(repositories, repository, repodoc)
  if (repodoc.private) {
    return {
      data: {
        name: 'update-payments',
        accountId: repodoc.accountId
      }
    }
  }
}
