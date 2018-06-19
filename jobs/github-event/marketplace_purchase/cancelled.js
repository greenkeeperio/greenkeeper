const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ marketplacePurchase }) {
  const { payments } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({
    logsDb: logs,
    accountId: marketplacePurchase.account.id,
    repoSlug: null,
    context: 'marketplace-purchase-cancelled'
  })
  log.info('started', { marketplacePurchase })
  const accountId = String(marketplacePurchase.account.id)

  try {
    await upsert(payments, accountId, { plan: 'free' })
    log.success('database: paymentDoc was updated', { plan: 'free' })
  } catch (error) {
    log.error('database: could not update paymentDoc', { error })
    throw error
  }
}
