const _ = require('lodash')
const Log = require('gk-log')
const promiseRetry = require('promise-retry')

const dbs = require('../../../lib/dbs')
const GithubQueue = require('../../../lib/github-queue')
const statsd = require('../../../lib/statsd')

const { createDocs } = require('../../../lib/repository-docs')

const max404Retries = 5

module.exports = async function ({ installation, repositories_added }) { // eslint-disable-line
  const { repositories: reposDb } = await dbs()
  const logs = dbs.getLogsDb()

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
  // spam :(
  if (['23046691', '1623538'].includes(installation.account.id) ||
    (repositories_added[0] && repositories_added[0].fullName &&
      (repositories_added[0].fullName.includes('dalavanmanphonsy') ||
        repositories_added[0].fullName.includes('CNXTEoEorg')))) {
    log.warn('exited: spam')
    return
  }

  const repositories = await Promise.mapSeries(repositories_added, doc => {
    const [owner, repo] = doc.full_name.split('/')
    return GithubQueue(installation.id).read(github => {
      return promiseRetry((retry, number) => {
        /*
          if we get a 404 here, log, and try again a few times.
          we’re doing the retry here so we can job-specific logs
          and to keep the retry logic in lib/github.js simple
        */
        return github.repos.get({ owner, repo })
          .catch(error => {
            if (error.status === 404) {
              if (number === max404Retries) {
                // ignore and log failure here
                log.warn(`repo not found on attempt #${number}: gving up`)
              } else {
                log.warn(`repo not found on attempt #${number}: retrying`)
                retry(error)
              }
            } else { // not a 404, throw normally
              throw error
            }
          })
      }, {
        retries: max404Retries,
        minTimeout: process.env.NODE_ENV === 'testing' ? 1 : 3000
      })
    })
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
