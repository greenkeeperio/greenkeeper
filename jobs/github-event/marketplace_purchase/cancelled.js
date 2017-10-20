const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ marketplace_purchase }) {
  const { payments, logs } = await dbs()
  const log = Log({
    logsDb: logs,
    accountId: marketplace_purchase.account.id,
    repoSlug: null,
    context: 'marketplace-purchase-cancelled'
  })
  log.info('started', { marketplace_purchase })
  const accountId = String(marketplace_purchase.account.id)

  try {
    await upsert(payments, accountId, { plan: 'free' })
    log.success('database: paymentDoc was updated', { plan: 'free' })
  } catch (error) {
    log.error('error', { error })
    throw error
  }
}
