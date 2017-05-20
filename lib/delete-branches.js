const _ = require('lodash')
const semver = require('semver')

const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')
const githubQueue = require('./github-write-queue')

module.exports = async function (
  { github, fullName, repositoryId },
  { change, after, dependency, dependencyType }
) {
  if (change !== 'removed' && !semver.validRange(after)) return
  const { repositories } = await dbs()

  const [owner, repo] = fullName.split('/')

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
          change === 'removed' ||
          semver.satisfies(branch.version, after) ||
          semver.ltr(branch.version, after)
      )
      .map(async branch => {
        let referenceDeleted = false
        try {
          // TODO: check if modified
          await githubQueue(() => github.gitdata.deleteReference({
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
