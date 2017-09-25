const env = require('../lib/env')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)
const dbs = require('../lib/dbs')
const upsert = require('../lib/upsert')

module.exports = async function ({ accountId, stripeSubscriptionId }) {
  const { payments } = await dbs()
  await stripe.subscriptions.del(
    stripeSubscriptionId,
    async (err, confirmation) => {
      if (err) {
        throw err
      }
      await upsert(payments, accountId, {
        stripeSubscriptionId: null
      })
    }
  )
}
