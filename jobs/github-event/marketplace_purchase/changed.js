const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')
const normalizePlanName = require('../../../lib/normalize-plan-name')

module.exports = async function ({ marketplace_purchase: marketplacePurchase }) {
  const { payments } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({
    logsDb: logs,
    accountId: marketplacePurchase.account.id,
    repoSlug: null,
    context: 'marketplace-purchase-changed'
  })
  log.info('started', { marketplacePurchase })
  const accountId = String(marketplacePurchase.account.id)

  try {
    const plan = normalizePlanName(marketplacePurchase.plan.name)
    await upsert(payments, accountId, { plan })
    log.success('database: paymentDoc was updated', { plan })
  } catch (error) {
    log.error('database: could not update paymentDoc', { error })
    throw error
  }
}
