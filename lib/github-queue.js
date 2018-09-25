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
  const log = Log({logsDb: logs, context: 'github-queue'})
  return log
}

function reportStats (stats) {
  const waitingInQueue = stats.started - stats.queued
  const waitingForToken = stats.tokenized - stats.started
  const waitingForResponse = stats.done - stats.tokenized
  const waitingForNetwork = stats.done - stats.started
  const total = stats.done - stats.queued
  statsd.gauge(`queues.github_${stats.type}_requests_time_in_queue`, waitingInQueue)
  statsd.gauge(`queues.github_${stats.type}_requests_time_to_token`, waitingForToken)
  statsd.gauge(`queues.github_${stats.type}_requests_time_to_response`, waitingForResponse)
  statsd.gauge(`queues.github_${stats.type}_requests_time_in_network`, waitingForNetwork)
  statsd.gauge(`queues.github_${stats.type}_requests_time_total`, total)
}

function getGitHubMethod (gen) {
  const [ match ] = gen.toString().match(/github\.[^(]+/)
  return match || ''
}

function write (installationId, gen) {
  statsd.increment('queues.github_write_requests')
  statsd.increment('queues.github_write_requests_tagged', [installationId, getGitHubMethod(gen)])
  const stats = {
    type: 'write',
    queued: Date.now()
  }
  try {
    return writeQueue.add(() => {
      return Promise.delay(env.NODE_ENV === 'testing' ? 0 : 1000)
        .then(() => {
          stats.started = Date.now()
          return getToken(installationId)
        })
        .then(({token}) => {
          stats.tokenized = Date.now()
          const github = Github()
          github.authenticate({ type: 'token', token })
          return gen(github)
        })
        .then(response => {
          stats.done = Date.now()
          reportStats(stats)
          return response.data
        })
    })
  } catch (e) {
    statsd.increment('queues.github_write_failures')
    const log = setupLog()
    log.warn('github: write exception', { installationId, exception: e })
    throw e
  }
}

function read (installationId, gen) {
  statsd.increment('queues.github_read_requests')
  statsd.increment('queues.github_read_requests_tagged', [installationId, getGitHubMethod(gen)])
  const stats = {
    type: 'read',
    queued: Date.now()
  }
  try {
    return readQueue.add(() => {
      stats.started = Date.now()
      return getToken(installationId)
        .then(({token}) => {
          stats.tokenized = Date.now()
          const github = Github()
          github.authenticate({ type: 'token', token })
          return gen(github)
        })
        .then(response => {
          stats.done = Date.now()
          reportStats(stats)
          if (response.data) {
            return response.data
          }

          // some responses don’t have .data, let’s find out which
          // https://rollbar.com/neighbourhoodie/gk-jobs/items/2969/

          var logs = dbs.getLogsDB()
          const log = Log({logsDb: logs, accountId: 'github', repoSlug: 'queue', context: 'github-queue'})
          log.warn('github: response.data is `undefined`', { installationId, response })
        })
    })
  } catch (e) {
    statsd.increment('queues.github_read_failures')
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
