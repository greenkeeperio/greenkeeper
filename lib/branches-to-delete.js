const _ = require('lodash')
const semver = require('semver')

module.exports = {
  getDependencyChanges,
  getDependencyBranchesToDelete,
  getGroupBranchesToDelete
}

function getDependencyChanges (changes) {
  let dependencyChanges = []

  _.each(changes, (type, dependencyType) => {
    _.each(type, (dep, dependency) => {
      if (dep.change === 'added') return
      dependencyChanges.push(
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

  return dependencyChanges
}
async function getDependencyBranchesToDelete ({changes, repositories, repositoryId, config}) {
  const dependencyChanges = getDependencyChanges(changes)

  return Promise.all(dependencyChanges.map(async dependencyChange => {
    return getSingleDependencyBranchesToDelete({changes: dependencyChange, repositories, repositoryId, config})
  }))
}

async function getSingleDependencyBranchesToDelete ({changes, repositories, repositoryId, config}) {
  const { change, after, dependency, dependencyType, groupName } = changes

  let branches = []
  if (change !== 'removed' && !semver.validRange(after)) return []

  // TODO: this would return multiple branch docs, possibly for irrelevant groups,
  // or if a group is specified, for irrelevant root level package.json
  branches = _.map(
    (await repositories.query('branch_by_dependency', {
      key: [repositoryId, dependency, dependencyType],
      include_docs: true
    })).rows,
    'doc'
  )
  return _(branches)
  .filter(
    branch =>
    // include branch if dependency was removed
    change === 'removed' ||
    // include branch if update version satisfies branch version (branch is outdated)
    semver.satisfies(branch.version, after) ||
    // include branch if is not satisfied, but later (eg. update is an out of range major update)
    semver.ltr(branch.version, after)
  )
  .filter(
    branch => {
      // if groupName is passed in, only include branches of that group
      // branch.head = 'greenkeeper/${groupName}/${dependency}'
      if (groupName) {
        return branch.head.includes(`${config.branchPrefix}${groupName}/`)
      } else {
        // If there's no groupName, only return branches that don’t belong to groups
        return branch.head.includes(`${config.branchPrefix}${dependency}`)
      }
    })
    .value()
}

async function getGroupBranchesToDelete ({configChanges, repositories, repositoryId}) {
  if (configChanges.removed.length || configChanges.modified.length) {
    const groups = _.uniq(configChanges.removed.concat(configChanges.modified))
    // delete all branches for those groups
    return Promise.all(_.map(groups, async (group) => {
      return Promise.all(_.map(
        (await repositories.query('branch_by_group', {
          key: [repositoryId, group],
          include_docs: true
        })).rows,
        'doc'
      ))
    }))
  } else {
    return []
  }
}
