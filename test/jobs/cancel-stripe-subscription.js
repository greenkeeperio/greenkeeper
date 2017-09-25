const { test, tearDown } = require('tap')
const nock = require('nock')
const worker = require('../../jobs/cancel-stripe-subscription')

const dbs = require('../../lib/dbs')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('Cancel Stripe Subscription', async t => {
  const { payments } = await dbs()
  t.plan(2)

  nock('https://api.stripe.com/v1')
    .delete('/subscriptions/345')
    .reply(200, () => {
      t.pass('Stripe called')
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

  await worker({
    accountId: '123',
    stripeSubscriptionId: '345'
  })

  const payment = await payments.get('123')
  t.is(payment.stripeSubscriptionId, null)
  t.end()
})

tearDown(async () => {
  const { payments } = await dbs()
  await payments.remove(await payments.get('123'))
})
