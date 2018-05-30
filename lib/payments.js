const _ = require('lodash')
const dbs = require('../lib/dbs')

const validPaidPlanNames = ['org', 'org_year', 'personal', 'personal_year', 'team', 'business']

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
    if (validPaidPlanNames.includes(plan)) return doc
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

async function getAmountOfCurrentlyPrivateAndEnabledRepos (accountId) {
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
  try {
    const paymentDoc = await payments.get(String(accountId))
    if (!paymentDoc.plan) return false
    if (paymentDoc.plan === 'opensource') return true
    if (paymentDoc.plan === 'team') {
      if (await module.exports.getAmountOfCurrentlyPrivateAndEnabledRepos(accountId) >= 15) {
        return true // team plan & repo limit reached
      }
      return false // team plan & repo limit *not* reached
    }
  } catch (error) {
    if (error.status !== 404) throw error
  }
  return false // all other plans plan
}

module.exports = {
  hasStripeBilling,
  getActiveBilling,
  maybeUpdatePaymentsJob,
  getAmountOfCurrentlyPrivateAndEnabledRepos,
  getAccountNeedsMarketplaceUpgrade
}
