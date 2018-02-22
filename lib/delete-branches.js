const _ = require('lodash')
const semver = require('semver')

const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')
const githubQueue = require('./github-queue')

// TODO: needs to take an optional `groupName` param
module.exports = async function (
  { installationId, fullName, repositoryId },
  { change, after, dependency, dependencyType }
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

  // TODO: needs to filter branchDocs by optional `groupName` param,
  // which is part of `branchDoc.head`

  const branchDocs = await Promise.all(
    _(branches)
      .filter(
        branch =>
          change === 'removed' ||
          semver.satisfies(branch.version, after) ||
          semver.ltr(branch.version, after)
      )
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
