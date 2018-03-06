const nock = require('nock')

const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists.js')
const purchasePurchase = require('../../../../jobs/github-event/marketplace_purchase/purchased')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('marketplace purchased', async () => {
  test('create entry in payments database', async () => {
    const { payments } = await dbs()

    const newJob = await purchasePurchase({
      marketplace_purchase: {
        account: {
          type: 'Organization',
          id: 444,
          login: 'GitHub'
        },
        plan: {
          id: 9,
          name: 'Open Source',
          description: 'A really, super professional-grade CI solution',
          monthly_price_in_cents: 9999,
          yearly_price_in_cents: 11998,
          price_model: 'flat-rate',
          unit_name: null,
          bullets: [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    expect(newJob).toBeFalsy()

    const payment = await payments.get('444')
    expect(payment.plan).toEqual('opensource')
  })

  test('update entry in payments database from free to github paid', async () => {
    const { payments } = await dbs()
    await payments.put({
      _id: '445',
      plan: 'free'
    })

    const newJob = await purchasePurchase({
      marketplace_purchase: {
        account: {
          type: 'Organization',
          id: 445,
          login: 'GitHub'
        },
        plan: {
          id: 9,
          name: 'Team',
          description: 'A really, super professional-grade CI solution',
          monthly_price_in_cents: 9999,
          yearly_price_in_cents: 11998,
          price_model: 'flat-rate',
          unit_name: null,
          bullets: [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    expect(newJob).toBeFalsy()

    const payment = await payments.get('445')
    expect(payment.plan).toEqual('team')
  })

  test('update entry in payments database from free to github free', async () => {
    const { payments } = await dbs()
    await payments.put({
      _id: '446',
      plan: 'free'
    })

    const newJob = await purchasePurchase({
      action: 'purchased',
      effective_date: '2017-04-06T02:01:16Z',
      marketplace_purchase: {
        account: {
          type: 'Organization',
          id: 446,
          login: 'GitHub'
        },
        billing_cycle: 'monthly',
        next_billing_date: '2017-05-01T00:00:00Z',
        unit_count: null,
        plan: {
          id: 9,
          name: 'Open Source',
          description: 'A really, super professional-grade CI solution',
          monthly_price_in_cents: 9999,
          yearly_price_in_cents: 11998,
          price_model: 'flat-rate',
          unit_name: null,
          bullets: [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    expect(newJob).toBeFalsy()

    const payment = await payments.get('446')
    expect(payment.plan).toEqual('opensource')
  })

  test('update entry in payments database from stripe to github paid', async () => {
    const { payments } = await dbs()
    await payments.put({
      _id: '447',
      plan: 'personal',
      stripeCustomerId: 'cus_abc',
      stripeItemId: 'si_xyz',
      stripeSubscriptionId: 'sub_abcxyz'
    })

    const newJob = await purchasePurchase({
      marketplace_purchase: {
        account: {
          type: 'Organization',
          id: 447,
          login: 'GitHub'
        },
        plan: {
          id: 9,
          name: 'Team',
          description: 'A really, super professional-grade CI solution',
          monthly_price_in_cents: 9999,
          yearly_price_in_cents: 11998,
          price_model: 'flat-rate',
          unit_name: null,
          bullets: [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('cancel-stripe-subscription')

    const payment = await payments.get('447')
    expect(payment.plan).toEqual('team')
  })

  test('update entry in payments database from stripe to github free', async () => {
    const { payments } = await dbs()
    await payments.put({
      _id: '448',
      plan: 'personal',
      stripeCustomerId: 'cus_abc',
      stripeItemId: 'si_xyz',
      stripeSubscriptionId: 'sub_abcxyz'
    })

    const newJob = await purchasePurchase({
      action: 'purchased',
      effective_date: '2017-04-06T02:01:16Z',
      marketplace_purchase: {
        account: {
          type: 'Organization',
          id: 448,
          login: 'GitHub'
        },
        billing_cycle: 'monthly',
        next_billing_date: '2017-05-01T00:00:00Z',
        unit_count: null,
        plan: {
          id: 9,
          name: 'Open Source',
          description: 'A really, super professional-grade CI solution',
          monthly_price_in_cents: 9999,
          yearly_price_in_cents: 11998,
          price_model: 'flat-rate',
          unit_name: null,
          bullets: [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('cancel-stripe-subscription')

    const payment = await payments.get('448')
    expect(payment.plan).toEqual('opensource')
  })

  afterAll(async () => {
    const { payments } = await dbs()
    await removeIfExists(payments, '444', '445', '446', '447', '448')
  })
})
