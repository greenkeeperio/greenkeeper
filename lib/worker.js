const { resolve } = require('path')
const Log = require('gk-log')
const _ = require('lodash')
const Promise = require('bluebird')

const env = require('./env')
const rollbar = require('./rollbar')
const statsd = require('./statsd')
const dbs = require('./dbs')
const { hasPaidAccount } = require('./payments')

const dev = env.NODE_ENV === 'development'

module.exports = async function worker (scheduleJob, channel, job) {
  const data = JSON.parse(job.content.toString())
  if (dev) console.log(data.name, data.type, data.action)
  const logs = dbs.getLogsDb()
  const accountId = Number(data.accountId) ||
    _.get(data, 'repository.owner.id') ||
    _.get(data, 'installation.account.id') ||
    _.get(data, 'organization.id') ||
    null
  const repoSlug = _.get(data, 'repository.full_name') || null
  const log = Log({ logsDb: logs, accountId, repoSlug, context: 'worker' })

  const rollbarPayload = {
    person: {
      id: accountId
    },
    context: _.compact([
      data.name,
      data.type,
      data.action,
      _.get(job, 'fields.redelivered') && 'retried'
    ]).join('.'),
    data
  }

  try {
    var jobWorker = require(resolve(__dirname, '../jobs', data.name))
    statsd.increment(
      _.compact([
        `job.${data.name}`,
        data.type && `job.${data.name}.${data.type}`,
        data.type &&
          data.action &&
          `job.${data.name}.${data.type}.${data.action}`
      ])
    )
  } catch (err) {
    rollbar.debug(err, null, rollbarPayload)

    // job not implemented, reported so throwing away
    return channel.nack(job, false, false)
  }

  let jobStartedAt = 0
  try {
    // start timer for job runtime
    jobStartedAt = Date.now()

    var newJobs = await jobWorker(data)
  } catch (err) {
    let level = 'error'
    if (err.message.toLowerCase().includes('bad credentials')) {
      level = 'warning'
      statsd.increment('job_errors_github_auth')
      log.error('github: bad credentials', { error: err, job: data })
      // retry job because of flaky GitHub auth layer
      channel.nack(job)
    } else if (/not implemented/.test(err.message)) {
      level = 'debug'
      log.error('job not implemented', { error: err, job: data })
      // job action not implemented, reported so throwing away
      channel.nack(job, false, false)
    } else if (job.fields.redelivered) {
      // repeated error, reported so throwing away
      channel.nack(job, false, false)
    } else {
      if (dev) console.log(err, data)
      statsd.increment('job_errors')
      log.error('worker could not be created', { error: err, job: data })
      // an error occured, try it once more
      channel.nack(job)
    }

    const error = typeof err === 'object' && !(err instanceof Error)
      ? new Error(err.message)
      : err

    return rollbar[level](
      error,
      null,
      rollbarPayload
    )
  } finally {
    const jobFinishedAt = Date.now()
    const runtimeDuration = jobFinishedAt - jobStartedAt

    statsd.gauge('job_runtime', runtimeDuration, { tag: data.name })
  }

  statsd.increment(
    _.compact([
      `job.${data.name}.success`,
      data.type && `job.${data.name}.${data.type}.success`,
      data.type &&
        data.action &&
        `job.${data.name}.${data.type}.${data.action}.success`
    ])
  )

  if (!_.isArray(newJobs)) newJobs = [newJobs]
  newJobs = _.compact(newJobs)

  // all done, no more work
  if (!newJobs.length) return channel.ack(job)
  try {
    const originalJobData = data
    const isPayed = await hasPaidAccount(data.accountId, log)

    await Promise.mapSeries(newJobs, (
      {
        data,
        delay
      }
    ) => {
      if (!data) {
        log.error('worker recieved no payload', { job: originalJobData })
        return
      }

      const priority = isPayed ? 3 : (data.name === 'added' || data.name === 'create-initial-branch') ? 2 : 1
      return scheduleJob(
        Buffer.from(JSON.stringify(data)),
        _.pickBy({
          priority,

          headers: delay && {
            'x-delay': delay
          }
        })
      )
    })
    log.success('job is scheduled', { job: data })
  } catch (err) {
    rollbar.critical(err, null, rollbarPayload)
    log.error('job could not be scheduled', { error: err, job: data })
    statsd.increment('job_scheduling_errors')

    if (job.fields.redelivered) {
      // repeated error, reported so throwing away
      return channel.nack(job, false, false)
    }

    // reschedule job because resulting jobs could not be scheduled
    return channel.nack(job)
  }

  // all done
  channel.ack(job)
}
