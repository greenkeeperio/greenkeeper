const dbs = require('../../../lib/dbs')
const getConfig = require('../../../lib/get-config')

module.exports = async function (data) {
  const { repositories } = await dbs()
  const { pull_request: pullRequest, repository } = data
  const repositoryId = String(repository.id)
  const prDocId = `${repositoryId}:pr:${pullRequest.id}`
  const repoDoc = await repositories.get(repositoryId)
  const config = getConfig(repoDoc)

  const wasCreatedByGreenkeeper = pullRequest.user.type === 'Bot' && pullRequest.user.login.substr(0, 11) === 'greenkeeper'
  if (wasCreatedByGreenkeeper) return

  const isInitialGreenkeeperBranch = pullRequest.head.ref === `${config.branchPrefix}initial`
  if (!isInitialGreenkeeperBranch) return

  await repositories.put(
    {
      _id: prDocId,
      repositoryId,
      accountId: repository.owner.id,
      type: 'pr',
      initial: true,
      number: pullRequest.number,
      head: pullRequest.head.ref,
      state: pullRequest.state,
      merged: pullRequest.merged,
      createdAt: new Date().toJSON(),
      createdByUser: true
    }
  )
}
