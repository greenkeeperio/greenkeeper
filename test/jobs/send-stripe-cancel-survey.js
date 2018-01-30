const { test } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()
const worker = proxyquire('../../jobs/send-stripe-cancel-survey', {
  'nodemailer': {
    createTransport () {
      return {
        sendMail (message, callback) {
          callback(null, {})
        }
      }
    }
  }
})

const dbs = require('../../lib/dbs')
const timeToWaitAfterTests = 1000

const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('send-stripe-cancel-survey', async t => {
  const { payments } = await dbs()

  t.beforeEach(async () => {
    await payments.put({
      _id: '1',
      stripeSubscriptionId: null
    })
    await payments.put({
      _id: '2',
      stripeSubscriptionId: 'hello'
    })
  })

  t.afterEach(async () => {
    nock.cleanAll()
    await payments.remove(await payments.get('1'))
    await payments.remove(await payments.get('2'))
  })

  t.test('exit if the paymentsDoc has a stripeSubscriptionId', async t => {
    t.plan(1)
    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .optionally()
      .reply(200, () => {
        t.fail('should not have contacted stripe')
        return {}
      })

    await worker({
      accountId: '2',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    t.ok(true)
    await waitFor(timeToWaitAfterTests)
  })

  t.test('exit if canceled_at in the stripe subscription is null', async t => {
    t.plan(1)
    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .reply(200, {
        canceled_at: null,
        customer: 'julia'
      })
      .get('/v1/customers/julia')
      .optionally()
      .reply(200, () => {
        t.fail('should not have contacted stripe')
        return {}
      })

    await worker({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    t.ok(true)
    await waitFor(timeToWaitAfterTests)
  })

  t.test('exit if stripe customer has no email', async t => {
    t.plan(1)
    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .reply(200, {
        canceled_at: 'timestamp',
        customer: 'julia'
      })
      .get('/v1/customers/julia')
      .reply(200, {
        email: ''
      })

    await worker({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    t.ok(true)
    await waitFor(timeToWaitAfterTests)
  })

  t.test('send email', async t => {
    t.plan(2)

    const emailWorker = proxyquire('../../jobs/send-stripe-cancel-survey', {
      'nodemailer': {
        createTransport () {
          return {
            sendMail (message, callback) {
              t.ok(true)
              callback(null, {})
            }
          }
        }
      }
    })

    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .reply(200, {
        canceled_at: 'timestamp',
        customer: 'julia'
      })
      .get('/v1/customers/julia')
      .reply(200, {
        email: 'julia@julia.com'
      })

    await emailWorker({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    t.ok(true)
    await waitFor(timeToWaitAfterTests)
  })
})
