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
    context: 'marketplace-purchase-created'
  })
  log.info('started', { marketplace_purchase })
  const accountId = String(marketplace_purchase.account.id)
  let paymentDoc

  await upsert(payments, accountId, {
    plan: normalizePlanName(marketplace_purchase.plan.name)
  })

  try {
    paymentDoc = await payments.get(String(accountId))
    log.success('database: paymentDoc created', { paymentDoc })
  } catch (error) {
    log.error('database: no paymentDoc created', { error })
    if (error.status !== 404) throw error
  }

  if (paymentDoc && paymentDoc.stripeSubscriptionId) {
    log.info('scheduled `cancel-stripe-subscription` job')
    return {
      data: {
        name: 'cancel-stripe-subscription',
        accountId: paymentDoc._id,
        stripeSubscriptionId: paymentDoc.stripeSubscriptionId
      }
    }
  }
}
