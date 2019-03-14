/*

jobs/github-event/repository/archived.js

Hook receiver for the repository archived event (https://developer.github.com/v3/activity/events/types/#repositoryevent)

When a repository is archived, we want to disable it so Greenkeeper will
stop trying to act on it when one of its dependencies is updated.

*/

const Log = require('gk-log')

const env = require('../../../lib/env')
const dbs = require('../../../lib/dbs')
const { maybeUpdatePaymentsJob } = require('../../../lib/payments')
const { updateDoc } = require('../../../lib/repository-docs')

module.exports = async function ({ repository }) {
  const { repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: repository.owner.id, repoSlug: repository.full_name, context: 'repo-archived' })
  log.info(`disabling ${repository.full_name}`)

  const repositoryId = String(repository.id)
  let repoDoc = await repositories.get(repositoryId)
  repoDoc.enabled = false
  repoDoc.archived = true
  await updateDoc(repositories, repository, repoDoc)
  if (!env.IS_ENTERPRISE) {
    return maybeUpdatePaymentsJob({ accountId: repoDoc.accountId, isPrivate: repoDoc.private })
  }
}
