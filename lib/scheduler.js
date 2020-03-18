const env = require('./env')

module.exports.connect = (channel, consume) => {
  channel.consume(env.EVENTS_QUEUE_NAME, consume)
  channel.consume(env.JOBS_QUEUE_NAME, consume)
}

module.exports.cron = (_name, job, interval) => {
  setInterval(job, interval)
}

module.exports.start = () => {}