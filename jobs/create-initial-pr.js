const crypto = require('crypto')

const _ = require('lodash')
const statsd = require('../lib/statsd')
const getConfig = require('../lib/get-config')
const dbs = require('../lib/dbs')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')
const upsert = require('../lib/upsert')

const prContent = require('../content/initial-pr')

module.exports = async function (
  { repository, branchDoc, combined, installationId, accountId }
) {
  accountId = String(accountId)
  const { repositories } = await dbs()
  const repositoryId = String(repository.id)
  let repodoc = await repositories.get(repositoryId)
  const config = getConfig(repodoc)

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

  const ghqueue = githubQueue(installationId)

  await ghqueue.write(github => github.repos.createStatus({
    owner,
    repo,
    sha,
    state: 'success',
    context: 'greenkeeper/verify',
    description: 'Greenkeeper verified pull request',
    target_url: 'https://greenkeeper.io/verify.html'
  }))

  const billingAccount = await getActiveBilling(accountId)
  const hasBillingAccount = !!billingAccount
  const accountNeedsMarketplaceUpgrade = await getAccountNeedsMarketplaceUpgrade(accountId)

  if (repodoc.private && (!hasBillingAccount || accountNeedsMarketplaceUpgrade)) {
    const targetUrl = accountNeedsMarketplaceUpgrade ? 'https://github.com/marketplace/greenkeeper/' : 'https://account.greenkeeper.io/'

    await ghqueue.write(github => github.repos.createStatus({
      owner,
      repo,
      sha,
      state: 'pending',
      context: 'greenkeeper/payment',
      description: 'Payment required, merging will have no effect',
      target_url: targetUrl
    }))
  }

  const ghRepo = await ghqueue.read(github => github.repos.get({ owner, repo }))

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
    } = await ghqueue.write(github => github.pullRequests.create({
      owner,
      repo,
      title: enabled
        ? `Add Greenkeeper badge 🌴`
        : (depsUpdated ? 'Update dependencies' : 'Add badge') +
            ' to enable Greenkeeper 🌴',
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
      await ghqueue.write(github => github.issues.addLabels({
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
    const pr = (await ghqueue.read(github => github.pullRequests.getAll({
      owner,
      repo,
      base,
      head: `${owner}:${head}`
    })))[0]

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
