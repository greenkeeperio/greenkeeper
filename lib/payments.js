const _ = require('lodash')
const dbs = require('../lib/dbs')

async function hasStripeBilling (accountId) {
  const activeBilling = await getActiveBilling(accountId)
  return !!activeBilling && !!activeBilling.stripeSubscriptionId
}

async function getActiveBilling (accountId) {
  if (!accountId) throw new Error('getActiveBilling requires accountId')
  const { payments } = await dbs()
  try {
    const doc = await payments.get(String(accountId))
    const { plan } = doc
    if (plan === 'org' || plan === 'personal' || plan === 'team' || plan === 'business') return doc
  } catch (e) {
    if (e.status !== 404) throw e
  }
  return false
}

async function maybeUpdatePaymentsJob (accountId, isPrivate) {
  if (isPrivate && (await hasStripeBilling(accountId))) {
    return {
      data: {
        name: 'update-payments',
        accountId
      }
    }
  }
}

async function getCurrentlyPrivateAndEnabledRepos (accountId) {
  const { repositories } = await dbs()

  const billing = await repositories.query('billing', {
    key: accountId,
    group_level: 1,
    reduce: true
  })
  return _.get(billing, 'rows[0].value', 0)
}

async function getAccountNeedsMarketplaceUpgrade (accountId) {
  const { payments } = await dbs()
  const paymentDoc = await payments.get(String(accountId))

  if (!paymentDoc.plan) return false
  if (paymentDoc.plan === 'opensource') return true
  if (paymentDoc.plan === 'team') {
    console.log('***TEAM***')
    console.log('***Repos***', await getCurrentlyPrivateAndEnabledRepos(accountId))
    if (await getCurrentlyPrivateAndEnabledRepos(accountId) >= 15) {
      console.log('***TEAM OVER LIMIT***')
      return true // team plan & repo limit reached
    }
    return false // team plan & repo limit *not* reached
  }
  return false // all other plans plan
}

module.exports = {
  hasStripeBilling,
  getActiveBilling,
  maybeUpdatePaymentsJob,
  getCurrentlyPrivateAndEnabledRepos,
  getAccountNeedsMarketplaceUpgrade
}
