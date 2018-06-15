// const cluster = require('cluster')

global.Promise = require('bluebird')
Promise.config({
  longStackTraces: true
})

const _ = require('lodash')
const Queue = require('promise-queue')

const env = require('./lib/env')
const dbs = require('./lib/dbs')
const statsd = require('./lib/statsd')
const enterpriseSetup = require('./lib/enterprise-setup')

require('./lib/rollbar')

// if (cluster.isMaster && env.NODE_ENV !== 'development') {
//   for (let i = 0; i++ < env.WORKER_SIZE;) cluster.fork()

//   cluster.on('exit', (worker, code, signal) => {
//     console.log('worker %d died (%s). restarting...', worker.process.pid, signal || code)
//     cluster.fork()
//   })
// } else {
;(async () => {
  const amqp = require('amqplib')

  const conn = await amqp.connect(env.AMQP_URL)
  const channel = await conn.createChannel()

  // only allow 128 items to pile up
  channel.prefetch(128)

  // 5 different prios because order matters
  // e.g. always sync before everything else
  // or always uninstall integrations before installing
  await channel.assertQueue(env.EVENTS_QUEUE_NAME, {
    maxPriority: 5
  })

  await channel.assertExchange(`${env.JOBS_QUEUE_NAME}-exchange`, 'x-delayed-message', {
    arguments: {
      'x-delayed-type': 'direct'
    }
  })

  // one prio for free, support and paid plans each
  const jobsQueue = await channel.assertQueue(env.JOBS_QUEUE_NAME, {
    maxPriority: 3
  })

  await channel.bindQueue(jobsQueue.queue, `${env.JOBS_QUEUE_NAME}-exchange`, env.JOBS_QUEUE_NAME)

  const scheduleJob = channel.publish.bind(channel, `${env.JOBS_QUEUE_NAME}-exchange`, env.JOBS_QUEUE_NAME)
  const worker = require('./lib/worker').bind(null, scheduleJob, channel)

  // if you need a customized queue configuration, you can add it here
  // e.g. const queues = {'stripe-event': new Queue(1, 10)}
  const queues = {}
  function queueJob (queueId, job) {
    const q = queues[queueId] = queues[queueId] || new Queue(1, Infinity)
    return q.add(() => worker(job))
  }
  channel.consume(env.EVENTS_QUEUE_NAME, consume)
  channel.consume(env.JOBS_QUEUE_NAME, consume)

  if (env.NODE_ENV !== 'testing') {
    setInterval(function collectAccountQueueStats () {
      statsd.gauge('queues.account-jobs', Object.keys(queues).length)
    }, 5000)
  }

  if (env.IS_ENTERPRISE) {
    await enterpriseSetup()
  }

  const scheduleRemindersJobData = Buffer.from(JSON.stringify({name: 'schedule-stale-initial-pr-reminders'}))
  async function scheduleReminders () {
    try {
      await scheduleJob(scheduleRemindersJobData, {priority: 1})
    } catch (e) {
      console.log(e)
    }
  }

  const monorepoSupervisorJobData = Buffer.from(JSON.stringify({name: 'monorepo-supervisor'}))
  async function scheduleMonorepoReleaseSupervisor () {
    try {
      await scheduleJob(monorepoSupervisorJobData, {priority: 1})
    } catch (e) {
      console.log(e)
    }
  }
  setTimeout(scheduleReminders, 5000)
  setInterval(scheduleReminders, 24 * 60 * 60 * 1000)
  setInterval(scheduleMonorepoReleaseSupervisor, 5 * 60 * 1000)

  async function consume (job) {
    const data = JSON.parse(job.content.toString())
    const jobsWithoutOwners = ['registry-change', 'stripe-event', 'schedule-stale-initial-pr-reminders', 'reset', 'cancel-stripe-subscription', 'update-nodejs-version', 'deprecate-nodejs-version', 'monorepo-supervisor']
    if (jobsWithoutOwners.includes(data.name) || data.type === 'marketplace_purchase') {
      return queueJob(data.name, job)
    }

    let queueId = Number(data.accountId) ||
      _.get(data, 'repository.owner.id') ||
      _.get(data, 'installation.account.id') ||
      _.get(data, 'organization.id')

    if (!queueId) {
      const login = _.get(data, 'repository.owner.name')
      try {
        if (!login) throw new Error(`can not identify job owner of ${data.name}`)

        const {installations} = await dbs()
        queueId = _.get(await installations.query('by_login', {
          key: login
        }), 'rows[0].id')

        if (!queueId) throw new Error('totally can not identify job owner')
      } catch (e) {
        channel.nack(job, false, false)
        throw e
      }
    }
    const spamQueueIds = ['23046691', '1623538', '133018953', '13286164', 'dalavanmanphonsy', 'CNXTEoEorg', 'tectronics']
    if (spamQueueIds.includes(String(queueId))) {
      // spam
      channel.ack(job)
      return
    }
    queueJob(queueId, job)
  }
})()
// }
