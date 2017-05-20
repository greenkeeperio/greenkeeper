const dbs = require('../lib/dbs')
const env = require('../lib/env')
const { getActiveBilling } = require('../lib/payments')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)
const _ = require('lodash')

module.exports = async ({ accountId }) => {
  const { repositories } = await dbs()
  const billingAccount = await getActiveBilling(accountId)
  if (!billingAccount || !billingAccount.stripeItemId) return

  const billing = await repositories.query('billing', {
    key: accountId,
    group_level: 1,
    reduce: true
  })
  const currentlyPrivateAndEnabledRepos = _.get(billing, 'rows[0].value', 0)

  const baseRepos = billingAccount.plan === 'org' ? 10 : 0

  const newQuantity = Math.max(baseRepos, currentlyPrivateAndEnabledRepos)
  await stripe.subscriptionItems.update(billingAccount.stripeItemId, {
    quantity: newQuantity
  })
}
