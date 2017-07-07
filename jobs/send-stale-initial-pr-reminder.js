const githubQueue = require('../lib/github-queue')
const dbs = require('../lib/dbs')
const upsert = require('../lib/upsert')
const statsd = require('../lib/statsd')
const staleInitialPRReminderComment = require('../content/stale-initial-pr-reminder')

module.exports = async function (
  { prNumber, repositoryId, accountId }
) {
  accountId = String(accountId)
  repositoryId = String(repositoryId)

  const { installations, repositories } = await dbs()
  const installation = await installations.get(accountId)
  const repository = await repositories.get(repositoryId)
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)

  if (repository.enabled) return
  if (repository.staleInitialPRReminder) return

  const [owner, repo] = repository.fullName.split('/')

  const issue = await ghqueue.read(github => github.issues.get({
    owner,
    repo,
    number: prNumber
  }))

  if (issue.state !== 'open' || issue.locked) return

  await ghqueue.write(github => github.issues.createComment({
    owner,
    repo,
    number: prNumber,
    body: staleInitialPRReminderComment
  }))

  await upsert(repositories, repositoryId, {
    staleInitialPRReminder: true
  })

  statsd.increment('stale-initial-pr-reminder')
}
