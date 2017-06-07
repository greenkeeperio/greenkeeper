const _ = require('lodash')

const dbs = require('../../../lib/dbs')
const GithubQueue = require('../../../lib/github-queue')
const statsd = require('../../../lib/statsd')

const { createDocs } = require('../../../lib/repository-docs')

module.exports = async function ({ installation, repositories_added }) {
  const { repositories: reposDb } = await dbs()
  if (!repositories_added.length) return

  const repositories = await Promise.mapSeries(repositories_added, doc => {
    const [owner, repo] = doc.full_name.split('/')
    return GithubQueue(installation.id).read(github => github.repos.get({ owner, repo }))
  })

  statsd.increment('repositories', repositories.length)

  const repoDocs = await createDocs({
    repositories,
    accountId: String(installation.account.id)
  })

  // saving installation repos to db
  await reposDb.bulkDocs(repoDocs)

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
