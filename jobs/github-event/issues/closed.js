const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ issue, repository }) {
  const { repositories, logs } = await dbs()
  const log = Log({logsDb: logs, accountId: repository.owner.id, repoSlug: repository.full_name, context: 'issues-closed'})
  log.info('started', {issue})
  const issueDocId = `${repository.id}:issue:${issue.number}`

  try {
    await repositories.get(issueDocId)
  } catch (err) {
    if (err.status === 404) {
      log.warn('database: issue document was not found', {error: err})
      return
    }
    log.error('database: retrieving the issue document failed', {error: err})
    throw err
  }

  await upsert(repositories, issueDocId, { state: 'closed' })
  log.success('database: issue document successfully updated with `state: closed`')
}
