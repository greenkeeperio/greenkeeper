const dbs = require('../lib/dbs')
const env = require('../lib/env')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)
const _ = require('lodash')

const events = [
  'customer.subscription.created',
  'customer.subscription.deleted'
]
module.exports = async function ({ id }) {
  const { payments } = await dbs()
  const { type, data } = await stripe.events.retrieve(id)
  if (!_.includes(events, type)) return
  const subscriptionId = data.object.id
  const paymentDoc = _.get(
    await payments.query('by_stripe', {
      key: subscriptionId,
      include_docs: true
    }),
    'rows[0].doc'
  )
  // TODO: retry in case this is a race condition
  if (!paymentDoc) throw new Error('no payment in database')

  if (type === 'customer.subscription.created') {
    return {
      data: {
        name: 'payment-changed',
        accountId: paymentDoc._id
      }
    }
  }
  if (type === 'customer.subscription.deleted') {
    await payments.put(
      _.assign(paymentDoc, {
        stripeSubscriptionId: null,
        plan: 'free',
        repos: 1
      })
    )

    return {
      data: {
        name: 'send-stripe-cancel-survey',
        stripeSubscriptionId: subscriptionId,
        accountId: paymentDoc._id
      }
    }
  }
}
