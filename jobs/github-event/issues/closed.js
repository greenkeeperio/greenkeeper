const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ issue, repository }) {
  const { repositories } = await dbs()
  const issueDocId = `${repository.id}:issue:${issue.number}`

  try {
    await repositories.get(issueDocId)
  } catch (err) {
    if (err.status === 404) return
    throw err
  }

  await upsert(repositories, issueDocId, { state: 'closed' })
}
