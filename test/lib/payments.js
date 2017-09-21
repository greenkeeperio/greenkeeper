const { test, tearDown } = require('tap')
const simple = require('simple-mock')

const dbs = require('../../lib/dbs')
const { getActiveBilling, maybeUpdatePaymentsJob, hasStripeBilling, getAccountNeedsMarketplaceUpgrade, getCurrentlyPrivateAndEnabledRepos } = require(
  '../../lib/payments'
)

test('payments', async t => {
  const { payments, repositories } = await dbs()
  await payments.put({
    _id: '123',
    stripeSubscriptionId: 'stripe123',
    plan: 'personal'
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

  /* getActiveBilling */

  t.test('getActiveBilling with billing personal', async t => {
    const billing = await getActiveBilling('123')
    t.equal(billing.stripeSubscriptionId, 'stripe123', 'stripe id')
    t.equal(billing.plan, 'personal', 'plan')
    t.end()
  })
  t.test('getActiveBilling with billing org', async t => {
    const billing = await getActiveBilling('123org')
    t.equal(billing.stripeSubscriptionId, 'stripe124', 'stripe id')
    t.equal(billing.plan, 'org', 'plan')
    t.end()
  })
  t.test('getActiveBilling without billing', async t => {
    const billing = await getActiveBilling('000')
    t.notOk(billing)
    t.end()
  })
  t.test('getActiveBilling with free billing', async t => {
    const billing = await getActiveBilling('123free')
    t.notOk(billing)
    t.end()
  })
  t.test('getActiveBilling with opensource billing', async t => {
    const billing = await getActiveBilling('123opensource')
    t.notOk(billing)
    t.end()
  })
  t.test('getActiveBilling with billing team', async t => {
    const billing = await getActiveBilling('123team')
    t.equal(billing.plan, 'team', 'plan')
    t.end()
  })
  t.test('getActiveBilling with billing business', async t => {
    const billing = await getActiveBilling('123business')
    t.equal(billing.plan, 'business', 'plan')
    t.end()
  })
  t.test('throw on missing accountId', async t => {
    try {
      await getActiveBilling()
      t.fail('should not succeed')
    } catch (e) {
      t.ok(e)
    }
    t.end()
  })

  /* hasStripeBilling */

  t.test('hasStripeBilling without stripe', async t => {
    const billing = await hasStripeBilling('123team')
    t.notOk(billing)
    t.end()
  })
  t.test('hasStripeBilling with stripe', async t => {
    const billing = await hasStripeBilling('123')
    t.ok(billing)
    t.end()
  })

    /* maybeUpdatePaymentsJob */

  t.test('maybeUpdatePaymentsJob without billing', async t => {
    const newJob = await maybeUpdatePaymentsJob('000', true)
    t.notOk(newJob)
    t.end()
  })

  t.test('maybeUpdatePaymentsJob without stripe', async t => {
    const newJob = await maybeUpdatePaymentsJob('123business', true)
    t.notOk(newJob)
    t.end()
  })
  t.test('maybeUpdatePaymentsJob with billing, not private', async t => {
    const newJob = await maybeUpdatePaymentsJob('123', false)
    t.notOk(newJob)
    t.end()
  })
  t.test('maybeUpdatePaymentsJob with billing', async t => {
    const newJob = await maybeUpdatePaymentsJob('123', true)
    t.same(newJob, {
      data: {
        name: 'update-payments',
        accountId: '123'
      }
    })
    t.end()
  })

  /* getCurrentlyPrivateAndEnabledRepos */

  t.test('getCurrentlyPrivateAndEnabledRepos with no Repos', async t => {
    const result = await getCurrentlyPrivateAndEnabledRepos('123')
    t.equal(result, 0, '0 private and enabled repos')
    t.end()
  })

  t.test('getCurrentlyPrivateAndEnabledRepos with one Repo', async t => {
    const result = await getCurrentlyPrivateAndEnabledRepos('123team')
    t.equal(result, 1, '1 private and enabled repo')
    t.end()
  })

  /* getAccountNeedsMarketplaceUpgrade */

  t.test('getAccountNeedsMarketplaceUpgrade without billing', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('000')
    t.notOk(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with `free` plan', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123free')
    t.notOk(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with stripe `personal` plan', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123')
    t.notOk(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with stripe `org` plan', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123org')
    t.notOk(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with `opensource` plan', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123opensource')
    t.ok(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with `team` plan and under repo limit', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123team')
    t.notOk(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with `team` plan and reached repo limit', async t => {
    const payments = require('../../lib/payments')
    simple.mock(payments, 'getCurrentlyPrivateAndEnabledRepos').resolveWith(15)
    const result = await getAccountNeedsMarketplaceUpgrade('123team')
    simple.restore()

    t.ok(result)
    t.end()
  })

  t.test('getAccountNeedsMarketplaceUpgrade with stripe `business` plan', async t => {
    const result = await getAccountNeedsMarketplaceUpgrade('123business')
    t.notOk(result)
    t.end()
  })
})

tearDown(async () => {
  const { payments, repositories } = await dbs()
  payments.remove(await payments.get('123'))
  payments.remove(await payments.get('123free'))
  payments.remove(await payments.get('123org'))
  payments.remove(await payments.get('123opensource'))
  payments.remove(await payments.get('123team'))
  payments.remove(await payments.get('123business'))
  repositories.remove(await repositories.get('44a'))
  repositories.remove(await repositories.get('44b'))
  repositories.remove(await repositories.get('44c'))
  repositories.remove(await repositories.get('44d'))
})
