const dbs = require('../lib/dbs')

module.exports = async function () {
  const {repositories} = await dbs()
  const minAgeInDays = 7
  const maxAgeInDays = 14
  const startDate = new Date(Date.now() - maxAgeInDays * 24 * 60 * 60 * 1000).toJSON()
  const endDate = new Date(Date.now() - minAgeInDays * 24 * 60 * 60 * 1000).toJSON()

  const stalePRs = await repositories.query('open_initial_pr', {
    startkey: startDate,
    endkey: endDate,
    inclusive_end: true,
    include_docs: true
  })
  return stalePRs.rows.map(function (row) {
    return {
      data: {
        name: 'send-stale-initial-pr-reminder',
        prNumber: row.doc.number,
        repositoryId: row.doc.repositoryId,
        accountId: row.doc.accountId
      }
    }
  })
}
