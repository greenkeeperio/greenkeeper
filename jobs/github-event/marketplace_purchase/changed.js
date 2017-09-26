const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')
const normalizePlanName = require('../../../lib/normalize-plan-name')

module.exports = async function ({ marketplace_purchase }) {
  const { payments } = await dbs()
  const accountId = String(marketplace_purchase.account.id)

  await upsert(payments, accountId, {
    plan: normalizePlanName(marketplace_purchase.plan.name)
  })
}
