const dbs = require('../lib/dbs')

async function hasBilling (accountId) {
  return !!await getActiveBilling(accountId)
}

async function getActiveBilling (accountId) {
  if (!accountId) throw new Error('getActiveBilling requires accountId')
  const { payments } = await dbs()
  try {
    const doc = await payments.get(String(accountId))
    const { plan } = doc
    if (plan === 'org' || plan === 'personal') return doc
  } catch (e) {
    if (e.status !== 404) throw e
  }
  return false
}

async function maybeUpdatePaymentsJob (accountId, isPrivate) {
  if (isPrivate && (await hasBilling(accountId))) {
    return {
      data: {
        name: 'update-payments',
        accountId
      }
    }
  }
}

module.exports = {
  hasBilling,
  getActiveBilling,
  maybeUpdatePaymentsJob
}
