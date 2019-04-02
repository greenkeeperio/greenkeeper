const _ = require('lodash')

async function getAllAccounts (installations, results) {
  const limit = 200
  let skip = 0
  let allAccounts = []
  const accountIds = _.compact(_.map(_.flattenDeep(results), 'value.accountId'))

  // send multiple smaller allDocs requests and paginate them.
  while (true) {
    const partialAccounts = await module.exports.getAllDocs(installations, skip, limit, accountIds)
    if (partialAccounts.length === 0) break

    skip += limit
    allAccounts = [...allAccounts, ...partialAccounts]
  }

  return _.keyBy(_.compact(_.map(allAccounts, 'doc')), '_id')
}

async function getAllDocs (db, skip, limit, accountIds) {
  return (await db.allDocs({
    keys: accountIds,
    limit,
    skip,
    include_docs: true
  })).rows
}

async function getAllMonorepoDocs (repositories, keysToFindMonorepoDocs) {
  const limit = 200
  let skip = 0
  let monorepoDocs = []

  // send multiple smaller query requests and paginate them.
  while (true) {
    const partialMonorepoDocs = await module.exports.queryDocs(repositories, skip, limit, keysToFindMonorepoDocs)
    if (partialMonorepoDocs.length === 0) break

    skip += limit
    monorepoDocs = [...monorepoDocs, ...partialMonorepoDocs]
  }
  return monorepoDocs
}

async function queryDocs (db, skip, limit, monorepoKeys) {
  return (await db.query('by_full_name', {
    keys: monorepoKeys,
    limit,
    skip,
    include_docs: true
  })).rows
}

module.exports = {
  getAllAccounts,
  getAllDocs,
  getAllMonorepoDocs,
  queryDocs
}
