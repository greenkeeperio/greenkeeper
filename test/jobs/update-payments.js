const { test, tearDown } = require('tap')
const proxyquire = require('proxyquire').noCallThru()

const dbs = require('../../lib/dbs')

test('update-payments', async t => {
  t.test('update stripe', async t => {
    const { repositories } = await dbs()

    await repositories.put({
      _id: '1',
      accountId: '123',
      fullName: 'finnp/private1',
      enabled: true,
      private: true
    })
    await repositories.put({
      _id: '2',
      accountId: '123',
      fullName: 'finnp/private2',
      enabled: true,
      private: true
    })
    await repositories.put({
      _id: '3',
      accountId: '123',
      fullName: 'finnp/public',
      enabled: true,
      private: false
    })
    await repositories.put({
      _id: '4',
      accountId: '124',
      fullName: 'other/private',
      enabled: true,
      private: true
    })

    t.plan(3)

    const worker = proxyquire('../../jobs/update-payments', {
      '../lib/payments': {
        getActiveBilling: async () => {
          return {
            plan: 'personal',
            stripeSubscriptionId: 'stripe123',
            stripeItemId: 'si123'
          }
        }
      },
      stripe: key => ({
        subscriptionItems: {
          update: (stripeItemId, { quantity }) => {
            t.equal(quantity, 2, 'personal: 2 repositories')
            t.equal(stripeItemId, 'si123', 'stripe item key')
          }
        }
      })
    })

    const newJobs = await worker({ accountId: '123' })
    t.notOk(newJobs, 'no new jobs scheduled')
  })

  t.test('ignore if stripeItemId is missing', async t => {
    const worker = proxyquire('../../jobs/update-payments', {
      '../lib/payments': {
        getActiveBilling: async () => {
          return {
            plan: 'beta'
          }
        }
      },
      stripe: key => ({
        subscriptionItems: {
          update: (stripeItemId, { quantity }) => {
            t.fail('stripe was called')
          }
        }
      })
    })
    const newJobs = await worker({ accountId: '123' })
    t.notOk(newJobs, 'no new jobs scheduled')
    t.end()
  })
})

tearDown(async () => {
  const { repositories } = await dbs()

  await Promise.all([
    repositories.remove(await repositories.get('1')),
    repositories.remove(await repositories.get('2')),
    repositories.remove(await repositories.get('3')),
    repositories.remove(await repositories.get('4'))
  ])
})
