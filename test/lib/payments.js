const { test, tearDown } = require('tap')
const dbs = require('../../lib/dbs')
const { getActiveBilling, maybeUpdatePaymentsJob, hasBilling } = require(
  '../../lib/payments'
)

test('payments', async t => {
  const { payments } = await dbs()
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
  t.test('getActiveBilling with billing', async t => {
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
  t.test('throw on missing accountId', async t => {
    try {
      await getActiveBilling()
      t.fail('should not succeed')
    } catch (e) {
      t.ok(e)
    }
    t.end()
  })

  t.test('hasBilling without billing', async t => {
    const billing = await hasBilling('000')
    t.notOk(billing)
    t.end()
  })
  t.test('hasBilling with billing', async t => {
    const billing = await hasBilling('123')
    t.ok(billing)
    t.end()
  })

  t.test('maybeUpdatePaymentsJob without billing', async t => {
    const newJob = await maybeUpdatePaymentsJob('000', true)
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
})

tearDown(async () => {
  const { payments } = await dbs()
  payments.remove(await payments.get('123'))
  payments.remove(await payments.get('123free'))
  payments.remove(await payments.get('123org'))
})
