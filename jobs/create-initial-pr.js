const crypto = require('crypto')

const _ = require('lodash')
const statsd = require('../lib/statsd')
const getConfig = require('../lib/get-config')
const dbs = require('../lib/dbs')
const env = require('../lib/env')
const githubQueue = require('../lib/github-write-queue')
const GitHub = require('../lib/github')
const { hasBilling } = require('../lib/payments')
const upsert = require('../lib/upsert')
const getToken = require('../lib/get-token')

const prContent = require('../content/initial-pr')

module.exports = async function ({ repository, branchDoc, combined, installationId, accountId }) {
  accountId = String(accountId)
  const { repositories } = await dbs()
  const repositoryId = String(repository.id)
  let repodoc = await repositories.get(repositoryId)
  const config = getConfig(repodoc)
  const { token } = await getToken(installationId)
  const github = GitHub()
  github.authenticate({ type: 'token', token })

  const [owner, repo] = repodoc.fullName.split('/')
  const {
    sha,
    head,
    base,
    travisModified,
    depsUpdated,
    badgeAdded,
    badgeUrl
  } = branchDoc

  let enabled = false
  if (!depsUpdated && !repodoc.private) {
    repodoc = await upsert(repositories, repodoc._id, {
      enabled: true
    })
    enabled = true
  }

  branchDoc = await upsert(repositories, branchDoc._id, {
    statuses: combined.statuses,
    processed: true,
    state: combined.state
  })

  await githubQueue(() => github.repos.createStatus({
    owner,
    repo,
    sha,
    state: 'success',
    context: 'greenkeeper/verify',
    description: 'Greenkeeper verified pull request',
    target_url: 'https://greenkeeper.io/verify.html'
  }))

  const accountHasBilling = await hasBilling(accountId)
  if (repodoc.private && !accountHasBilling) {
    await githubQueue(() => github.repos.createStatus({
      owner,
      repo,
      sha,
      state: 'pending',
      context: 'greenkeeper/payment',
      description: 'Payment required, merging will have no effect',
      target_url: 'https://account.greenkeeper.io/'
    }))
  }

  const ghRepo = await github.repos.get({ owner, repo })

  const secret = repodoc.private &&
    crypto
      .createHmac('sha256', env.NPMHOOKS_SECRET)
      .update(String(installationId))
      .digest('hex')

  const accountTokenUrl = `https://account.greenkeeper.io/status?token=${repodoc.accountToken}`

  const files = _.get(repodoc, 'files', {})

  // enabled
  try {
    var {
      id,
      number
    } = await githubQueue(() => github.pullRequests.create({
      owner,
      repo,
      title: enabled
        ? `Add Greenkeeper badge 🌴`
        : (depsUpdated ? 'Update dependencies' : 'Add badge') + ' to enable Greenkeeper 🌴',
      body: prContent({
        depsUpdated,
        ghRepo,
        newBranch: head,
        badgeUrl: badgeAdded && badgeUrl,
        travisModified,
        secret,
        installationId,
        success: combined.state === 'success',
        enabled,
        accountTokenUrl,
        files
      }),
      base,
      head
    }))
    statsd.increment('initial_pullrequests')

    if (config.label !== false) {
      await githubQueue(() => github.issues.addLabels({
        owner,
        repo,
        number,
        labels: [config.label]
      }))
    }
  } catch (err) {
    if (err.code !== 422) throw err

    // in case the pull request was already created
    // we just store that PRs info
    const pr = (await github.pullRequests.getAll({
      owner,
      repo,
      base,
      head: `${owner}:${head}`
    }))[0]

    id = pr.id
    number = pr.number
  }

  await upsert(
    repositories,
    `${repositoryId}:pr:${id}`,
    {
      repositoryId,
      accountId,
      type: 'pr',
      initial: true,
      number,
      head,
      state: 'open'
    },
    ['state']
  )
}
