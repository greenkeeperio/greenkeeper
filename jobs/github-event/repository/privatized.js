/*
jobs/github-event/repository/privatized.js
Hook receiver for the repository privatized event (https://developer.github.com/v3/activity/events/types/#repositoryevent)
*/

const Log = require('gk-log')

const env = require('../../../lib/env')
const dbs = require('../../../lib/dbs')
const { maybeUpdatePaymentsJob } = require('../../../lib/payments')
const updatedAt = require('../../../lib/updated-at')

module.exports = async function ({ repository }) {
  const { repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: repository.owner.id, repoSlug: repository.full_name, context: 'repo-privatized' })
  log.info(`set ${repository.full_name} to private`)

  const repositoryId = String(repository.id)
  let repoDoc = await repositories.get(repositoryId)
  repoDoc.enabled = false
  repoDoc.private = true
  await updateDoc(repositories, repository, repoDoc)

  if (!env.IS_ENTERPRISE) {
    log.warn('payment required')
    return maybeUpdatePaymentsJob({ accoundId: repoDoc.accountId, isPrivate: repoDoc.private, repositoryId })
  }

  function updateDoc (repositories, repository, repoDoc) {
    return repositories.put(
      updatedAt(
        Object.assign(repoDoc, {
          private: repository.private,
          fullName: repository.full_name,
          fork: repository.fork,
          hasIssues: repository.has_issues
        })
      )
    )
  }
}
