const dbs = require('../../../lib/dbs')
const getConfig = require('../../../lib/get-config')
const { hasBilling } = require('../../../lib/payments')
const githubQueue = require('../../../lib/github-queue')

module.exports = async function (data) {
  const { repositories } = await dbs()
  const { pull_request: pullRequest, repository, installation } = data
  const repositoryId = String(repository.id)
  const prDocId = `${repositoryId}:pr:${pullRequest.id}`
  const repoDoc = await repositories.get(repositoryId)
  const [owner, repo] = repository.full_name.split('/')
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
  const ghqueue = githubQueue(installation.id)

  const accountHasBilling = await hasBilling(repository.owner.id)
  if (repoDoc.private && !accountHasBilling) {
    await ghqueue.write(github => github.repos.createStatus({
      owner,
      repo,
      sha: pullRequest.head.sha,
      state: 'pending',
      context: 'greenkeeper/payment',
      description: 'Payment required, merging will have no effect',
      target_url: 'https://account.greenkeeper.io/'
    }))
  }
}
