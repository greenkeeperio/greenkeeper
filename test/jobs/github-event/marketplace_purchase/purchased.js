const { test, tearDown } = require('tap')
const nock = require('nock')
const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event/marketplace_purchase/purchased')

const removeIfExists = async (db, id) => {
  try {
    return await db.remove(await db.get(id))
  } catch (e) {
    if (e.status !== 404) {
      throw e
    }
  }
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('marketplace purchased', async t => {
  t.test('create entry in payments database', async t => {
    const { payments } = await dbs()

    const newJobs = await worker({
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

    t.notOk(newJobs, 'no new job scheduled')

    const payment = await payments.get('444')
    t.is(payment.plan, 'opensource', 'plan: opensource')
    t.end()
  })

  t.test('update entry in payments database from free to github paid', async t => {
    const { payments } = await dbs()
    await payments.put({
      _id: '445',
      plan: 'free'
    })

    const newJobs = await worker({
      'marketplace_purchase': {
        'account': {
          'type': 'Organization',
          'id': 445,
          'login': 'GitHub'
        },
        'plan': {
          'id': 9,
          'name': 'Team',
          'description': 'A really, super professional-grade CI solution',
          'monthly_price_in_cents': 9999,
          'yearly_price_in_cents': 11998,
          'price_model': 'flat-rate',
          'unit_name': null,
          'bullets': [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    t.notOk(newJobs, 'no new job scheduled')

    const payment = await payments.get('445')
    t.is(payment.plan, 'team', 'plan: team')
    t.end()
  })

  t.test('update entry in payments database from free to github free', async t => {
    const { payments } = await dbs()
    await payments.put({
      _id: '446',
      plan: 'free'
    })

    const newJobs = await worker({
      'action': 'purchased',
      'effective_date': '2017-04-06T02:01:16Z',
      'marketplace_purchase': {
        'account': {
          'type': 'Organization',
          'id': 446,
          'login': 'GitHub'
        },
        'billing_cycle': 'monthly',
        'next_billing_date': '2017-05-01T00:00:00Z',
        'unit_count': null,
        'plan': {
          'id': 9,
          'name': 'Open Source',
          'description': 'A really, super professional-grade CI solution',
          'monthly_price_in_cents': 9999,
          'yearly_price_in_cents': 11998,
          'price_model': 'flat-rate',
          'unit_name': null,
          'bullets': [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    t.notOk(newJobs, 'no new job scheduled')

    const payment = await payments.get('446')
    t.is(payment.plan, 'opensource', 'plan: opensource')
    t.end()
  })

  t.test('update entry in payments database from stripe to github paid', async t => {
    const { payments } = await dbs()
    await payments.put({
      _id: '447',
      plan: 'personal',
      stripeCustomerId: 'cus_abc',
      stripeItemId: 'si_xyz',
      stripeSubscriptionId: 'sub_abcxyz'
    })

    const newJob = await worker({
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

    t.ok(newJob, 'new job scheduled')
    t.is(newJob.data.name, 'cancel-stripe-subscription', 'Job is: cancel-stripe-subscription')

    const payment = await payments.get('447')
    t.is(payment.plan, 'team', 'plan: team')
    t.end()
  })

  t.test('update entry in payments database from stripe to github free', async t => {
    const { payments } = await dbs()
    await payments.put({
      _id: '448',
      plan: 'personal',
      stripeCustomerId: 'cus_abc',
      stripeItemId: 'si_xyz',
      stripeSubscriptionId: 'sub_abcxyz'
    })

    const newJob = await worker({
      'action': 'purchased',
      'effective_date': '2017-04-06T02:01:16Z',
      'marketplace_purchase': {
        'account': {
          'type': 'Organization',
          'id': 448,
          'login': 'GitHub'
        },
        'billing_cycle': 'monthly',
        'next_billing_date': '2017-05-01T00:00:00Z',
        'unit_count': null,
        'plan': {
          'id': 9,
          'name': 'Open Source',
          'description': 'A really, super professional-grade CI solution',
          'monthly_price_in_cents': 9999,
          'yearly_price_in_cents': 11998,
          'price_model': 'flat-rate',
          'unit_name': null,
          'bullets': [
            'This is the first bullet of the plan',
            'This is the second bullet of the plan'
          ]
        }
      }
    })

    t.ok(newJob, 'new job scheduled')
    t.is(newJob.data.name, 'cancel-stripe-subscription', 'Job is: cancel-stripe-subscription')

    const payment = await payments.get('448')
    t.is(payment.plan, 'opensource', 'plan: opensource')
    t.end()
  })
})

tearDown(async () => {
  const { payments } = await dbs()

  await removeIfExists(payments, '444')
  await removeIfExists(payments, '445')
  await removeIfExists(payments, '446')
  await removeIfExists(payments, '447')
  await removeIfExists(payments, '448')
})
