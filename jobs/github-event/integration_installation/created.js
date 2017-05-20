const crypto = require('crypto')

const _ = require('lodash')
const request = require('request-promise')

const dbs = require('../../../lib/dbs')
const getToken = require('../../../lib/get-token')
const GitHub = require('../../../lib/github')
const { createDocs } = require('../../../lib/repository-docs')
const statsd = require('../../../lib/statsd')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ installation }) {
  const { installations, repositories: reposDb } = await dbs()

  const docId = String(installation.account.id)
  const doc = await upsert(
    installations,
    docId,
    Object.assign(
      {
        installation: installation.id
      },
      _.pick(installation.account, ['login', 'type'])
    )
  )

  const { token } = await getToken(doc.installation)
  const github = GitHub()
  github.authenticate({ type: 'token', token })

  // getting installation repos from github
  let res = await github.integrations.getInstallationRepositories({
    per_page: 100
  })
  let { repositories } = res

  while (github.hasNextPage(res)) {
    res = await github.getNextPage(res)
    repositories = repositories.concat(res.repositories)
  }

  if (!repositories.length) return
  statsd.increment('repositories', repositories.length)

  const repoDocs = await createDocs({
    repositories,
    accountId: doc._id
  })

  // saving installation repos to db
  await reposDb.bulkDocs(repoDocs)

  statsd.increment('installs')
  statsd.event('install')

  try {
    const body = {
      type: installation.account.type.toLowerCase(),
      id: `github:${installation.account.id}`
    }
    const authorization = crypto
      .createHmac('sha256', 'migrationyolosecret')
      .update(body.type + body.id)
      .digest('hex')
    await request.post({
      url: 'https://api.greenkeeper.io/migrate',
      json: true,
      headers: {
        authorization
      },
      body
    })
  } catch (e) {}

  // scheduling create-initial-branch jobs
  return _(repoDocs)
    .map(repository => ({
      data: {
        name: 'create-initial-branch',
        repositoryId: repository._id,
        accountId: repository.accountId
      }
    }))
    .value()
}
