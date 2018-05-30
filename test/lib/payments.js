const simple = require('simple-mock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const {
  getActiveBilling,
  maybeUpdatePaymentsJob,
  hasStripeBilling,
  getAccountNeedsMarketplaceUpgrade,
  getAmountOfCurrentlyPrivateAndEnabledRepos
} = require('../../lib/payments')

describe('payments', async () => {
  beforeAll(async() => {
    const { payments, repositories } = await dbs()
    await payments.put({
      _id: '123',
      stripeSubscriptionId: 'stripe123',
      plan: 'personal'
    })
    await payments.put({
      _id: '123_personal_year',
      stripeSubscriptionId: 'stripe123',
      plan: 'personal_year'
    })
    await payments.put({
      _id: '123free',
      plan: 'free'
    })
    await payments.put({
      _id: '123org',
      stripeSubscriptionId: 'stripe124',
      plan: 'org'
    })
    await payments.put({
      _id: '123org_year',
      stripeSubscriptionId: 'stripe124',
      plan: 'org_year'
    })
    await payments.put({
      _id: '123opensource',
      plan: 'opensource'
    })
    await payments.put({
      _id: '123team',
      plan: 'team'
    })
    await payments.put({
      _id: '123business',
      plan: 'business'
    })

    await repositories.put({
      _id: '44a',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true,
      enabled: true
    })

    await repositories.put({
      _id: '44b',
      accountId: '123team',
      fullName: 'finnp/public',
      private: false,
      enabled: true
    })
    await repositories.put({
      _id: '44c',
      accountId: '123team',
      fullName: 'finnp/public',
      private: false,
      enabled: false
    })

    await repositories.put({
      _id: '44d',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true,
      enabled: false
    })
  })

  afterAll(async () => {
    const { payments, repositories } = await dbs()
    await Promise.all([
      removeIfExists(payments, '123', '123_personal_year', '123free', '123org', '123org_year', '123opensource', '123team', '123business'),
      removeIfExists(repositories, '44a', '44b', '44c', '44d')
    ])
  })

  describe('getActiveBilling', async() => {
    test('getActiveBilling with billing personal', async () => {
      const billing = await getActiveBilling('123')
      expect(billing.stripeSubscriptionId).toEqual('stripe123')
      expect(billing.plan).toEqual('personal')
    })

    test('getActiveBilling with billing yearly personal', async () => {
      const billing = await getActiveBilling('123_personal_year')
      expect(billing.stripeSubscriptionId).toEqual('stripe123')
      expect(billing.plan).toEqual('personal_year')
    })

    test('getActiveBilling with billing org', async () => {
      const billing = await getActiveBilling('123org')
      expect(billing.stripeSubscriptionId).toEqual('stripe124')
      expect(billing.plan).toEqual('org')
    })

    test('getActiveBilling with billing yearly org', async () => {
      const billing = await getActiveBilling('123org_year')
      expect(billing.stripeSubscriptionId).toEqual('stripe124')
      expect(billing.plan).toEqual('org_year')
    })

    test('getActiveBilling without billing', async () => {
      const billing = await getActiveBilling('000')
      expect(billing).toBeFalsy()
    })

    test('getActiveBilling with free billing', async () => {
      const billing = await getActiveBilling('123free')
      expect(billing).toBeFalsy()
    })

    test('getActiveBilling with opensource billing', async () => {
      const billing = await getActiveBilling('123opensource')
      expect(billing).toBeFalsy()
    })

    test('getActiveBilling with billing team', async () => {
      const billing = await getActiveBilling('123team')
      expect(billing.plan).toEqual('team')
    })

    test('getActiveBilling with billing business', async () => {
      const billing = await getActiveBilling('123business')
      expect(billing.plan).toEqual('business')
    })

    test('throw on missing accountId', async () => {
      try {
        await getActiveBilling()
      } catch (error) {
        expect(error).toBeTruthy()
      }
    })
  })

  describe('hasStripeBilling', async() => {
    test('hasStripeBilling without stripe', async () => {
      const billing = await hasStripeBilling('123team')
      expect(billing).toBeFalsy()
    })

    test('hasStripeBilling with stripe', async () => {
      const billing = await hasStripeBilling('123')
      expect(billing).toBeTruthy()
    })

    test('hasStripeBilling with stripe - yearly payment org', async () => {
      const billing = await hasStripeBilling('123org_year')
      expect(billing).toBeTruthy()
    })

    test('hasStripeBilling with stripe - yearly payment personal', async () => {
      const billing = await hasStripeBilling('123_personal_year')
      expect(billing).toBeTruthy()
    })
  })

  describe('maybeUpdatePaymentsJob', async() => {
    test('maybeUpdatePaymentsJob without billing', async () => {
      const newJob = await maybeUpdatePaymentsJob('000', true)
      expect(newJob).toBeFalsy()
    })

    test('maybeUpdatePaymentsJob without stripe', async () => {
      const newJob = await maybeUpdatePaymentsJob('123business', true)
      expect(newJob).toBeFalsy()
    })

    test('maybeUpdatePaymentsJob with billing, not private', async () => {
      const newJob = await maybeUpdatePaymentsJob('123', false)
      expect(newJob).toBeFalsy()
    })

    test('maybeUpdatePaymentsJob with billing', async () => {
      const newJob = await maybeUpdatePaymentsJob('123', true)
      expect(newJob).toMatchObject({
        data: {
          name: 'update-payments',
          accountId: '123'
        }
      })
    })
  })

  describe('getAmountOfCurrentlyPrivateAndEnabledRepos', async() => {
    test('getAmountOfCurrentlyPrivateAndEnabledRepos with no Repos', async () => {
      const result = await getAmountOfCurrentlyPrivateAndEnabledRepos('123')
      // zero private, enabled repos
      expect(result).toBe(0)
    })

    test('getAmountOfCurrentlyPrivateAndEnabledRepos with one Repo', async () => {
      const result = await getAmountOfCurrentlyPrivateAndEnabledRepos('123team')
      // one private, enabled repo
      expect(result).toBe(1)
    })
  })

  describe('getAccountNeedsMarketplaceUpgrade', async() => {
    test('getAccountNeedsMarketplaceUpgrade without billing', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('000')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with `free` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123free')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with stripe `personal` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with stripe `personal_year` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123_personal_year')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with stripe `org` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123org')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with stripe `org_year` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123org_year')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with `opensource` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123opensource')
      expect(result).toBeTruthy()
    })

    test('getAccountNeedsMarketplaceUpgrade with `team` plan and under repo limit', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123team')
      expect(result).toBeFalsy()
    })

    test('getAccountNeedsMarketplaceUpgrade with `team` plan and reached repo limit', async () => {
      const payments = require('../../lib/payments')
      simple.mock(payments, 'getAmountOfCurrentlyPrivateAndEnabledRepos').resolveWith(15)
      const result = await getAccountNeedsMarketplaceUpgrade('123team')
      simple.restore()

      expect(result).toBeTruthy()
    })

    test('getAccountNeedsMarketplaceUpgrade with stripe `business` plan', async () => {
      const result = await getAccountNeedsMarketplaceUpgrade('123business')
      expect(result).toBeFalsy()
    })
  })
})
