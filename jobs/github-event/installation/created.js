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
  const github = GitHub({ auth: `token ${token}` })

  let repositories
  // getting installation repos from github
  try {
    // For some reason, the accept header is not part of this
    // Octokit API
    const options = github.apps.listRepos.endpoint.merge({
      headers: {
        accept: 'application/vnd.github.machine-man-preview+json'
      },
      per_page: 100
    })
    // Paginate does not actually flatten results into a single result array
    // as it should, according to the docs, possibly due to these:
    // https://github.com/octokit/rest.js/issues/1161
    // https://github.com/octokit/routes/issues/329
    const results = await github.paginate(options)
    // So we flatten them ourselves
    repositories = _.flatten(results.map((result) => result.repositories))
  } catch (error) {
    log.error('error: could not fetch repositories from GitHub', { error })
  }

  if (!repositories.length) {
    log.warn('exited: no repositories found')
    return
  }

  log.info(`github: fetched ${repositories.length} installation repositories`)
  statsd.increment('repositories', repositories.length)

  let repoDocs = []
  try {
    repoDocs = createDocs({
      repositories,
      accountId: doc._id
    })
    // saving installation repos to db
    log.info(`Preparing to write ${repoDocs.length} repoDocs to the DB`)
    await reposDb.bulkDocs(repoDocs)
  } catch (error) {
    log.error('error: could not write repoDocs', { error })
  }
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
