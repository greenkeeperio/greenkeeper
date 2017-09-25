const env = require('../lib/env')
const { getActiveBilling, getCurrentlyPrivateAndEnabledRepos } = require('../lib/payments')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)

module.exports = async ({ accountId, repositoryId }) => {
  const billingAccount = await getActiveBilling(accountId)
    // ignore non-stripe users
  if (!billingAccount || !billingAccount.stripeSubscriptionId) return

  const currentlyPrivateAndEnabledRepos = await getCurrentlyPrivateAndEnabledRepos(accountId)

  // charge for new repo from Stripe
  const baseRepos = billingAccount.plan === 'org' ? 10 : 0
  const newQuantity = Math.max(baseRepos, currentlyPrivateAndEnabledRepos)
  await stripe.subscriptionItems.update(billingAccount.stripeItemId, {
    quantity: newQuantity
  })
}
