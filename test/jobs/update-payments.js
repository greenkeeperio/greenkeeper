const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('update-payments', async () => {
  beforeAll(async() => {
    const { repositories, installations } = await dbs()

    await installations.put({
      _id: '111',
      installation: 11,
      plan: 'free'
    })

    await repositories.put({
      _id: '1',
      accountId: '111',
      fullName: 'finnp/private1',
      enabled: true,
      private: true
    })
    await repositories.put({
      _id: '2',
      accountId: '111',
      fullName: 'finnp/private2',
      enabled: true,
      private: true
    })
    await repositories.put({
      _id: '3',
      accountId: '111',
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
  })

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(repositories, '1', '2', '3', '4'),
      removeIfExists(installations, '111')
    ])
  })

  test('update stripe', async () => {
    expect.assertions(3)

    const updatePayments = require('../../jobs/update-payments')

    // To mock only specific modules, use require.requireActual to restore the original modules,
    // then overwrite the one you want to mock
    jest.mock('../../lib/payments', () => {
      return {
        ...require.requireActual('../../lib/payments'),
        getActiveBilling: async() => {
          return {
            plan: 'personal',
            stripeSubscriptionId: 'stripe123',
            stripeItemId: 'si123'
          }
        }
      }
    })

    jest.mock('stripe', key => key => {
      return {
        subscriptionItems: {
          update: (stripeItemId, {quantity}) => {
            expect(quantity).toBe(2)
            expect(stripeItemId).toEqual('si123')
          }
        }
      }
    })

    const newJob = await updatePayments({ accountId: '111' })
    expect(newJob).toBeFalsy()
  })

  test('ignore if stripeSubscriptionId is missing', async () => {
    expect.assertions(1)

    const updatePayments = require('../../jobs/update-payments')
    jest.mock('../../lib/payments', () => {
      return {
        ...require.requireActual('../../lib/payments'),
        getActiveBilling: async() => {
          return {
            plan: 'org'
          }
        }
      }
    })

    jest.mock('stripe', key => key => {
      return {
        subscriptionItems: {
          update: (stripeItemId, {quantity}) => {
            console.log('fail: stripe was called')
            expect(false).toBeFalsy()
          }
        }
      }
    })

    const newJob = await updatePayments({ accountId: '111' })
    expect(newJob).toBeFalsy()
  })
})
