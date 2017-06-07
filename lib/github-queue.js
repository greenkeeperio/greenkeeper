const Queue = require('promise-queue')

const env = require('./env')
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

function write (installationId, gen) {
  return writeQueue.add(() => {
    return Promise.delay(env.NODE_ENV === 'testing' ? 0 : 1000)
      .then(() => getToken(installationId))
      .then(({token}) => {
        const github = Github()
        github.authenticate({ type: 'token', token })
        return gen(github)
      })
      .then(response => response.data)
  })
}

function read (installationId, gen) {
  return readQueue.add(() => {
    return getToken(installationId)
      .then(({token}) => {
        const github = Github()
        github.authenticate({ type: 'token', token })
        return gen(github)
      })
      .then(response => response.data)
  })
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
