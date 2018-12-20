const Log = require('gk-log')

const dbs = require('../lib/dbs')
const statsd = require('../lib/statsd')
const githubQueue = require('../lib/github-queue')
const updatedAt = require('../lib/updated-at')
const timeoutBody = require('../content/timeout-issue')
const getConfig = require('../lib/get-config')

module.exports = async function ({ repositoryId, accountId, repoSlug }) {
  const { installations, repositories } = await dbs()
  const installation = await installations.get(String(accountId))
  const installationId = installation.installation
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId, repoSlug, context: 'initial-timeout' })
  log.info(`Looking for initial PR doc for ${repoSlug}`)
  const initialPullRequests = await repositories.query('by_pr', {
    key: [String(repositoryId), 'greenkeeper/initial']
  })
  const prWasCreated = initialPullRequests.rows.length > 0
  if (prWasCreated) {
    log.success(`Found one or more initial PR docs for ${repoSlug}`, {
      initialPullRequests
    })
    return
  }
  log.warn(`No initial PR doc for ${repoSlug} found`)

  const repoDoc = await repositories.get(String(repositoryId))
  const { fullName } = repoDoc
  const [owner, repo] = fullName.split('/')
  const { label } = getConfig(repoDoc)

  const { number } = await githubQueue(installationId).write(github => github.issues.create({
    owner,
    repo,
    title: `Action required: Greenkeeper could not be activated 🚨`,
    body: timeoutBody({ fullName }),
    labels: [label]
  }))
  log.info(`Sent timeout issue #${number} for ${repoSlug}`, {
    issueDoc: `${repositoryId}:issue:${number}`,
    repositoryId
  })
  statsd.increment('initial_issues')

  await repositories.put(
    updatedAt({
      _id: `${repositoryId}:issue:${number}`,
      type: 'issue',
      initial: true,
      repositoryId,
      number,
      state: 'open'
    })
  )
}
