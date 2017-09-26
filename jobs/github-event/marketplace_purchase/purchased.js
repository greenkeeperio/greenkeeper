const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')
const normalizePlanName = require('../../../lib/normalize-plan-name')

module.exports = async function ({ marketplace_purchase }) {
  const { payments } = await dbs()

  const accountId = String(marketplace_purchase.account.id)
  let paymentDoc

  await upsert(payments, accountId, {
    plan: normalizePlanName(marketplace_purchase.plan.name)
  })

  try {
    paymentDoc = await payments.get(String(accountId))
  } catch (error) {
    if (error.status !== 404) throw error
  }

  if (paymentDoc && paymentDoc.stripeSubscriptionId) {
    return {
      data: {
        name: 'cancel-stripe-subscription',
        accountId: paymentDoc._id,
        stripeSubscriptionId: paymentDoc.stripeSubscriptionId
      }
    }
  }
}
