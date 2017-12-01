const crypto = require('crypto')
const Log = require('gk-log')
const _ = require('lodash')
const statsd = require('../lib/statsd')
const dbs = require('../lib/dbs')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')

const prContent = require('../content/initial-pr')

module.exports = async function (
  { repository, branchDoc, combined, installationId, accountId, prDocId }
) {
  accountId = String(accountId)
  const { repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const repositoryId = String(repository.id)

  const prDoc = await repositories.get(prDocId)
  if (prDoc.initialPrCommentSent) return

  const repodoc = await repositories.get(repositoryId)
  const log = Log({logsDb: logs, accountId, repoSlug: repodoc.fullName, context: 'create-initial-pr-comment'})
  log.info('started')

  const [owner, repo] = repodoc.fullName.split('/')
  const {
    head,
    travisModified,
    depsUpdated,
    badgeAdded,
    badgeUrl
  } = branchDoc

  branchDoc = await upsert(repositories, branchDoc._id, {
    statuses: combined.statuses,
    processed: true,
    state: combined.state
  })
  log.info('branchDoc: updated to `processed: true`', {branchDoc})

  const ghqueue = githubQueue(installationId)

  const ghRepo = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: repository info', {repositoryInfo: ghRepo})
  const issue = await ghqueue.read(github => github.issues.get({
    owner,
    repo,
    number: prDoc.number
  }))
  log.info('github: pull request info', {pullRequestInfo: issue})

  if (issue.state !== 'open') {
    log.warn('exited: pr is closed')
    return
  }

  if (issue.locked) {
    log.warn('exited: pr is locked')
    return
  }

  const secret = repodoc.private &&
    crypto
      .createHmac('sha256', env.NPMHOOKS_SECRET)
      .update(String(installationId))
      .digest('hex')

  const accountTokenUrl = `https://account.greenkeeper.io/status?token=${repodoc.accountToken}`

  const files = _.get(repodoc, 'files', {})

  await ghqueue.write(github => github.issues.createComment({
    owner,
    repo,
    body: prContent({
      depsUpdated,
      ghRepo,
      newBranch: head,
      badgeUrl: badgeAdded && badgeUrl,
      travisModified,
      secret,
      installationId,
      success: combined.state === 'success',
      enabled: false,
      accountTokenUrl,
      files
    }),
    number: prDoc.number
  }))
  statsd.increment('initial_pullrequest_comments')
  log.success('success')

  await upsert(repositories, prDocId, {
    initialPrCommentSent: true
  })
}
