const _ = require('lodash')

const dbs = require('../../../lib/dbs')
const statsd = require('../../../lib/statsd')

module.exports = async function ({ installation }) {
  const { installations, repositories: reposDb } = await dbs()
  const key = String(installation.account.id)

  // deleting installation repos from db
  const repositories = await reposDb.query('by_account', {
    key,
    include_docs: true
  })
  statsd.decrement('repositories', repositories.length)
  await reposDb.bulkDocs(
    repositories.rows.map(repo => _.assign(repo.doc, { _deleted: true }))
  )

  // deleting installation from db
  await installations.remove(await installations.get(key))

  statsd.decrement('installs')
  statsd.event('uninstall')
}
