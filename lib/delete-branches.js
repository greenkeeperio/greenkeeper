const _ = require('lodash')
const semver = require('semver')

const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')
const githubQueue = require('./github-queue')

// TODO: needs to take an optional `groupName` param
module.exports = async function (
  { installationId, fullName, repositoryId },
  { change, after, dependency, dependencyType, groupName }
) {
  if (change !== 'removed' && !semver.validRange(after)) return
  const { repositories } = await dbs()

  const [owner, repo] = fullName.split('/')

  // TODO: this would return multiple branch docs, possibly for irrelevant groups,
  // or if a group is specified, for irrelevant root level package.json
  const branches = _.map(
    (await repositories.query('branch_by_dependency', {
      key: [repositoryId, dependency, dependencyType],
      include_docs: true
    })).rows,
    'doc'
  )

  const branchDocs = await Promise.all(
    _(branches)
    .filter(
      branch =>
      change === 'removed' || // include branch if dependency was removed
      semver.satisfies(branch.version, after) || // include branch if update version satisfies branch version (branch is outdated)
      semver.ltr(branch.version, after)// include branch if is not satisfied, but later (eg. update is an out of range major update)
    )
    .filter(
      branch => {
        // if groupName is passed in, only include branches of that group
        // branch.head = 'greenkeeper/${groupName}/${dependency}'
        if (groupName) {
          return branch.head.includes(`greenkeeper/${groupName}/`)
        } else {
          // If there's no groupName, only return branches that don’t belong to groups
          return branch.head.includes(`greenkeeper/${dependency}`)
        }
      })
      .map(async branch => {
        let referenceDeleted = false
        try {
          // TODO: check if modified
          await githubQueue(installationId).write(github => github.gitdata.deleteReference({
            owner,
            repo,
            ref: `heads/${branch.head}`
          }))
          referenceDeleted = true
        } catch (e) {}
        return updatedAt(Object.assign(branch, { referenceDeleted }))
      })
      .value()
  )

  return repositories.bulkDocs(branchDocs)
}
