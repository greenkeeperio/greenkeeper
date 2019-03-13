const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const updatedAt = require('../lib/updated-at')
const getConfig = require('../lib/get-config')
const paymentRequiredBody = require('../content/payment-required')

module.exports = async function ({ accountId, repositoryId }) {
  const { installations, repositories } = await dbs()
  const installation = await installations.get(String(accountId))
  const installationId = installation.installation

  const repoDoc = await repositories.get(String(repositoryId))
  const { fullName } = repoDoc
  const [owner, repo] = fullName.split('/')
  const { label } = getConfig(repoDoc)

  const { number } = await githubQueue(installationId).write(github => github.issues.create({
    owner,
    repo,
    title: 'Payment required',
    body: paymentRequiredBody,
    labels: [label]
  }))

  await repositories.put(
    updatedAt({
      _id: `${repositoryId}:issue:${number}`,
      type: 'issue',
      initial: false,
      repositoryId,
      number,
      state: 'open'
    })
  )
}
