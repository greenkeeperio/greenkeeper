const _ = require('lodash')

const dbs = require('../../../lib/dbs')
const statsd = require('../../../lib/statsd')
const { maybeUpdatePaymentsJob } = require('../../../lib/payments')

module.exports = async function ({ installation, repositories_removed }) {
  const { repositories: reposDb } = await dbs()
  const accountId = String(installation.account.id)
  const repoIds = _.map(repositories_removed, repo => String(repo.id))

  // branches and prs will only be deleted on a complete uninstall
  const repositories = _(
    (await reposDb.query('by_account', {
      key: accountId,
      include_docs: true
    })).rows
  )
    .map('doc')
    .filter(doc => repoIds.some(id => doc._id === id))
    .map(doc => _.assign(doc, { _deleted: true }))
    .value()

  statsd.decrement('repositories', repositories.length)

  await reposDb.bulkDocs(repositories)

  const hasPrivateRepos = repositories.some(repo => repo.private)

  return await maybeUpdatePaymentsJob(accountId, hasPrivateRepos)
}
