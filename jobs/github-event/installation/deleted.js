const _ = require('lodash')
const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const statsd = require('../../../lib/statsd')

module.exports = async function ({ installation }) {
  const { installations, repositories: reposDb, logs } = await dbs()
  const key = String(installation.account.id)
  const log = Log({
    logsDb: logs,
    accountId: installation.account.id,
    repoSlug: null,
    context: 'installation-deleted'
  })
  log.info('started')
  // deleting installation repos from db
  const repositories = await reposDb.query('by_account', {
    key,
    include_docs: true
  })
  log.info('database: gathering all repositories', { repositories })
  statsd.decrement('repositories', repositories.length)
  await reposDb.bulkDocs(
    repositories.rows.map(repo => _.assign(repo.doc, { _deleted: true }))
  )
  log.info(
    'database: add `_deleted: true` to all repositories of that account'
  )

  // deleting installation from db
  await installations.remove(await installations.get(key))
  log.success('success')

  statsd.decrement('installs')
  statsd.event('uninstall')
}
