const { test, tearDown } = require('tap')
const nock = require('nock')
const worker = require('../../jobs/stripe-event')
const dbs = require('../../lib/dbs')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('enqueue email job when recieving stripe cancel event', async t => {
  const { payments } = await dbs()
// "api.stripe.com:443/v1/events/stripe_test_Id"
  nock('https://api.stripe.com')
    .get('/v1/events/stripe_test_Id')
    .reply(200, {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'stripe_test_SubscriptionId'
        }
      }

    })
  await payments.put({
    _id: '1',
    stripeSubscriptionId: 'stripe_test_SubscriptionId'
  })

  t.plan(3)
  const job = await worker({
    id: 'stripe_test_Id'
  })
  t.equal(job.data.name, 'send-stripe-cancel-survey', 'stripe cancel survey job send')
  t.equal(job.data.stripeSubscriptionId, 'stripe_test_SubscriptionId', 'correct stripe subscription id passed')
  t.equal(job.data.accountId, '1', 'correct accountId passed')
})

tearDown(async () => {
  const { payments } = await dbs()

  await payments.remove(await payments.get('1'))
})
