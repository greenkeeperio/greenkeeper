const _ = require('lodash')
const Log = require('gk-log')

const dbs = require('../../../lib/dbs')
const getToken = require('../../../lib/get-token')
const GitHub = require('../../../lib/github')
const { createDocs } = require('../../../lib/repository-docs')
const statsd = require('../../../lib/statsd')
const upsert = require('../../../lib/upsert')

module.exports = async function ({ installation }) {
  const { installations, repositories: reposDb } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({
    logsDb: logs,
    accountId: installation.account.id,
    repoSlug: null,
    context: 'installation-created'
  })

  log.info('started')
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
  log.info('Installation Document created', { installation: doc })

  const { token } = await getToken(doc.installation)
  const github = GitHub()
  github.authenticate({ type: 'token', token })

  // getting installation repos from github
  let res = await github.apps.getInstallationRepositories({
    per_page: 100
  })
  let { repositories } = res.data
  while (github.hasNextPage(res)) {
    res = await github.getNextPage(res)
    repositories = repositories.concat(res.data.repositories)
  }
  log.info('github: getting installation repositories', { repositories })

  if (!repositories.length) {
    log.warn('exited: no repositories found')
    return
  }
  statsd.increment('repositories', repositories.length)

  const repoDocs = await createDocs({
    repositories,
    accountId: doc._id
  })

  // saving installation repos to db
  await reposDb.bulkDocs(repoDocs)
  statsd.increment('installs')
  statsd.event('install')

  // scheduling create-initial-branch jobs
  log.success('starting create-initial-branch job', { repositories: repoDocs })
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
