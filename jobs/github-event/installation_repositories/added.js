const _ = require('lodash')
const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const GithubQueue = require('../../../lib/github-queue')
const statsd = require('../../../lib/statsd')

const { createDocs } = require('../../../lib/repository-docs')

module.exports = async function ({ installation, repositories_added }) {
  const { repositories: reposDb, logs } = await dbs()
  const log = Log({
    logsDb: logs,
    accountId: installation.account.id,
    repoSlug: null,
    context: 'installation-repositories-added'
  })
  log.info('started', { repositories_added })
  if (!repositories_added.length) {
    log.warn('exited: no repositories selected')
    return
  }

  const repositories = await Promise.mapSeries(repositories_added, doc => {
    const [owner, repo] = doc.full_name.split('/')
    return GithubQueue(installation.id).read(github =>
      github.repos.get({ owner, repo }))
  })

  log.info('added repositories', repositories)

  statsd.increment('repositories', repositories.length)

  const repoDocs = await createDocs({
    repositories,
    accountId: String(installation.account.id)
  })

  // saving installation repos to db
  await reposDb.bulkDocs(repoDocs)

  // scheduling create-initial-branch jobs
  log.success('starting create-initial-branch job')
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
