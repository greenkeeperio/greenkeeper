const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const cancelStripeSubscription = require('../../jobs/cancel-stripe-subscription')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

afterAll(async () => {
  const { payments } = await dbs()
  await Promise.all([
    removeIfExists(payments, '123')
  ])
})

test('Cancel Stripe Subscription', async () => {
  const { payments } = await dbs()
  expect.assertions(3)

  nock('https://api.stripe.com/v1')
    .delete('/subscriptions/345')
    .reply(200, () => {
      // Stripe called
      expect(true).toBeTruthy()
      return {
        stripeSubscriptionId: '345'
      }
    })

  await payments.put({
    _id: '123',
    plan: 'team',
    stripeCustomerId: 'cus_abc',
    stripeItemId: 'si_xyz',
    stripeSubscriptionId: '345'
  })

  await cancelStripeSubscription({
    accountId: '123',
    stripeSubscriptionId: '345'
  })

  const payment = await payments.get('123')
  expect(payment.stripeItemId).toBeNull()
  expect(payment.stripeSubscriptionId).toBeNull()
})
