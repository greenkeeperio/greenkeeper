const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')
const normalizePlanName = require('../../../lib/normalize-plan-name')

module.exports = async function ({ marketplace_purchase }) {
  const { payments, logs } = await dbs()
  const log = Log({
    logsDb: logs,
    accountId: marketplace_purchase.account.id,
    repoSlug: null,
    context: 'marketplace-purchase-changed'
  })
  log.info('started', { marketplace_purchase })
  const accountId = String(marketplace_purchase.account.id)

  try {
    const plan = normalizePlanName(marketplace_purchase.plan.name)
    await upsert(payments, accountId, { plan })
    log.success('database: paymentDoc was updated', { plan })
  } catch (error) {
    log.error('database: could not update paymentDoc', { error })
    throw error
  }
}
