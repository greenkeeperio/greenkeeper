const _ = require('lodash')

const GitHub = require('../../../lib/github')
const getToken = require('../../../lib/get-token')
const dbs = require('../../../lib/dbs')
const upsert = require('../../../lib/upsert')
const githubQueue = require('../../../lib/github-write-queue')

module.exports = async function (data) {
  const { repositories } = await dbs()
  const { pull_request: pullRequest, repository, installation } = data
  const prDocId = `${repository.id}:pr:${pullRequest.id}`

  try {
    await repositories.get(prDocId)
  } catch (err) {
    if (err.status === 404) return
    throw err
  }

  const prdoc = await upsert(
    repositories,
    prDocId,
    _.pick(pullRequest, ['state', 'merged'])
  )

  if (!prdoc.merged || !prdoc.initial) return

  let repodoc = await repositories.get(String(repository.id))
  const accountId = repodoc.accountId

  const [owner, repo] = repository.full_name.split('/')
  const { token } = await getToken(installation.id)
  const github = GitHub()
  github.authenticate({ type: 'token', token })

  repodoc = await upsert(repositories, String(repository.id), {
    enabled: true
  })
  try {
    await githubQueue(() => github.gitdata.deleteReference({
      owner,
      repo,
      ref: `heads/${prdoc.head}`
    }))
  } catch (e) {}

  if (repodoc.private) {
    return {
      data: {
        name: 'update-payments',
        accountId
      }
    }
  }
}
