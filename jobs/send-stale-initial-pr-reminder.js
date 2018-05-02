const githubQueue = require('../lib/github-queue')
const dbs = require('../lib/dbs')
const Log = require('gk-log')
const upsert = require('../lib/upsert')
const statsd = require('../lib/statsd')
const staleInitialPRReminderComment = require('../content/stale-initial-pr-reminder')

module.exports = async function (
  { prNumber, repositoryId, accountId }
) {
  accountId = String(accountId)
  repositoryId = String(repositoryId)

  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const installation = await installations.get(accountId)
  const repository = await repositories.get(repositoryId)
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)

  const log = Log({logsDb: logs, accountId, repoSlug: repository.fullName, context: 'send-stale-initial-pr-reminder'})

  log.info('started')

  if (repository.enabled) {
    log.info('stopped: repository enabled')
    return
  }

  if (repository.staleInitialPRReminder) {
    log.info('stopped: stale PR reminder already sent')
    return
  }

  const [owner, repo] = repository.fullName.split('/')

  const issue = await ghqueue.read(github => github.issues.get({
    owner,
    repo,
    number: prNumber
  }))

  if (issue.state !== 'open' || issue.locked) {
    log.info('stopped: issue closed or locked')
    return
  }

  await ghqueue.write(github => github.issues.createComment({
    owner,
    repo,
    number: prNumber,
    body: staleInitialPRReminderComment()
  }))

  try {
    await upsert(repositories, repositoryId, {
      staleInitialPRReminder: true
    })
  } catch (e) {
    log.warn('db: upsert failed', { repositoryId })
    throw e
  }

  statsd.increment('stale-initial-pr-reminder')
}
