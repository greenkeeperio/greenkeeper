const nock = require('nock')
const dbs = require('../../lib/dbs')

const timeToWaitAfterTests = 1000
const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

describe('send-stripe-cancel-survey', async () => {
  beforeEach(async () => {
    const { payments } = await dbs()
    await payments.put({
      _id: '1',
      stripeSubscriptionId: null
    })
    await payments.put({
      _id: '2',
      stripeSubscriptionId: 'hello'
    })

    jest.clearAllMocks()
  })

  afterEach(async () => {
    nock.cleanAll()
    const { payments } = await dbs()
    await payments.remove(await payments.get('1'))
    await payments.remove(await payments.get('2'))
  })

  jest.mock('nodemailer', () => {
    return {
      createTransport: () => {
        return {
          sendMail (message, callback) {
            callback(null, {})
          }
        }
      }
    }
  })
  const sendStripeCancelSurvey = require('../../jobs/send-stripe-cancel-survey')

  test('exit if the paymentsDoc has a stripeSubscriptionId', async () => {
    expect.assertions(1)
    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .optionally()
      .reply(200, () => {
        // should not have contacted stripe
        expect(false).toBeFalsy()
        return {}
      })

    await sendStripeCancelSurvey({
      accountId: '2',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    expect(true).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('exit if canceled_at in the stripe subscription is null', async () => {
    expect.assertions(1)

    nock('https://api.stripe.com')
      .get('/v1/subscriptions/oldSubscriptionId')
      .reply(200, {
        canceled_at: null,
        customer: 'julia'
      })
      .get('/v1/customers/julia')
      .optionally()
      .reply(200, () => {
        // should not have contacted stripe
        expect(false).toBeFalsy()
        return {}
      })

    await sendStripeCancelSurvey({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    expect(true).toBeTruthy()

    await waitFor(timeToWaitAfterTests)
  })

  test('exit if stripe customer has no email', async () => {
    expect.assertions(1)

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

    await sendStripeCancelSurvey({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    expect(true).toBeTruthy()

    await waitFor(timeToWaitAfterTests)
  })

  test('send email', async () => {
    expect.assertions(2)

    jest.resetModules()
    jest.mock('nodemailer', () => {
      return {
        createTransport: () => {
          return {
            sendMail (message, callback) {
              expect(true).toBeTruthy()
              callback(null, {})
            }
          }
        }
      }
    })
    const sendStripeCancelSurvey = require('../../jobs/send-stripe-cancel-survey')

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

    await sendStripeCancelSurvey({
      accountId: '1',
      stripeSubscriptionId: 'oldSubscriptionId'
    })
    expect(true).toBeTruthy()

    await waitFor(timeToWaitAfterTests)
  })
})
