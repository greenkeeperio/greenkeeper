const _ = require('lodash')
const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const statsd = require('../../../lib/statsd')
const env = require('../../../lib/env')
const { maybeUpdatePaymentsJob } = require('../../../lib/payments')

module.exports = async function ({ installation, repositories_removed }) {
  const { repositories: reposDb } = await dbs()
  const logs = dbs.getLogsDb()
  const accountId = String(installation.account.id)
  const repoIds = _.map(repositories_removed, repo => String(repo.id))
  const log = Log({
    logsDb: logs,
    accountId: installation.account.id,
    repoSlug: null,
    context: 'installation-repositories-removed'
  })
  log.info('started', { repositories_removed })
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

  log.info('database: add `_deleted: true` to selected repositories', {
    repositories
  })
  statsd.decrement('repositories', repositories.length)

  await reposDb.bulkDocs(repositories)

  if (env.IS_ENTERPRISE) {
    return
  }

  const hasPrivateRepos = repositories.some(repo => repo.private)

  log.success('starting maybeUpdatePaymentsJob', { hasPrivateRepos })

  return maybeUpdatePaymentsJob(accountId, hasPrivateRepos)
}
