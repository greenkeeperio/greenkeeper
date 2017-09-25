const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ marketplace_purchase }) {
  const { payments } = await dbs()
  const accountId = String(marketplace_purchase.account.id)

  await upsert(payments, accountId, {
    plan: 'free'
  })
}
