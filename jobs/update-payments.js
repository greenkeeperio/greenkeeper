const env = require('../lib/env')
const { getActiveBilling, getAmountOfCurrentlyPrivateAndEnabledRepos } = require('../lib/payments')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)

module.exports = async ({ accountId, repositoryId }) => {
  const billingAccount = await getActiveBilling(accountId)
  // ignore non-stripe users
  // checking for stripeSubscriptionId instead of stripeItemId because in
  // jobs/stripe-event.js L33-L40 only then stripeSubscriptionId is set to null
  if (!billingAccount || !billingAccount.stripeSubscriptionId) return

  const currentlyPrivateAndEnabledRepos = await getAmountOfCurrentlyPrivateAndEnabledRepos(accountId)

  // charge for new repo from Stripe
  const baseRepos = (['org', 'org_eur', 'org_year', 'org_year_eur'].includes(billingAccount.plan)) ? 10 : 0
  const newQuantity = Math.max(baseRepos, currentlyPrivateAndEnabledRepos)
  await stripe.subscriptionItems.update(billingAccount.stripeItemId, {
    quantity: newQuantity
  })
}
