const Queue = require('promise-queue')

const env = require('./env')
const statsd = require('./statsd')

const queue = new Queue(1, Infinity)

module.exports = function addToGitHubWriteQueue (gen) {
  return queue.add(() => Promise.delay(1000).then(gen))
}

if (env.NODE_ENV !== 'testing') {
  setInterval(
    function collectGitHubQueueStats () {
      statsd.gauge('queues.github-write', queue.getQueueLength())
    },
    5000
  )
}
