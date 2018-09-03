const Queue = require('promise-queue')

const env = require('./env')
const dbs = require('../lib/dbs')
const Log = require('gk-log')
const statsd = require('./statsd')
const getToken = require('./get-token')
const Github = require('../lib/github')

const writeQueue = new Queue(1, Infinity)
const readQueue = new Queue(50, Infinity)

module.exports = function (installationId) {
  return {
    write: write.bind(null, installationId),
    read: read.bind(null, installationId)
  }
}

function setupLog () {
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, context: 'github-queue' })
  return log
}

function write (installationId, gen) {
  try {
    return writeQueue.add(() => {
      return Promise.delay(env.NODE_ENV === 'testing' ? 0 : 1000)
        .then(() => getToken(installationId))
        .then(({ token }) => {
          const github = Github()
          github.authenticate({ type: 'token', token })
          return gen(github)
        })
        .then(response => response.data)
    })
  } catch (e) {
    const log = setupLog()
    log.warn('github: write exception', { installationId, exception: e })
    throw e
  }
}

function read (installationId, gen) {
  try {
    return readQueue.add(() => {
      return getToken(installationId)
        .then(({ token }) => {
          const github = Github()
          github.authenticate({ type: 'token', token })
          return gen(github)
        })
        .then(response => {
          if (response.data) {
            return response.data
          }

          // some responses don’t have .data, let’s find out which
          // https://rollbar.com/neighbourhoodie/gk-jobs/items/2969/

          var logs = dbs.getLogsDB()
          const log = Log({ logsDb: logs, accountId: 'github', repoSlug: 'queue', context: 'github-queue' })
          log.warn('github: response.data is `undefined`', { installationId, response })
        })
    })
  } catch (e) {
    const log = setupLog()
    log.warn('github: read exception', { installationId, exception: e })
    throw e
  }
}

if (env.NODE_ENV !== 'testing') {
  setInterval(
    function collectGitHubQueueStats () {
      statsd.gauge('queues.github-write', writeQueue.getQueueLength())
      statsd.gauge('queues.github-read', readQueue.getQueueLength())
    },
    5000
  )
}
