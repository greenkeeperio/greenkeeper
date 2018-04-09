const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

afterAll(async () => {
  const { payments } = await dbs()
  await removeIfExists(payments, '1')
})

test('enqueue email job when recieving stripe cancel event', async () => {
  const { payments } = await dbs()
  const stripeEvent = require('../../jobs/stripe-event')

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

  expect.assertions(3)
  const job = await stripeEvent({
    id: 'stripe_test_Id'
  })

  expect(job.data.name).toEqual('send-stripe-cancel-survey')
  expect(job.data.stripeSubscriptionId).toEqual('stripe_test_SubscriptionId')
  expect(job.data.accountId).toEqual('1')
})
