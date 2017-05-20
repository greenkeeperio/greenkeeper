const { resolve } = require('path')

const { test, tearDown } = require('tap')
const proxyquire = require('proxyquire').noCallThru()

const jobPath = resolve.bind(null, __dirname, '../../jobs')

test('worker throws away unimplemented job', async t => {
  t.plan(2)

  const worker = require('../../lib/worker')

  await worker(
    t.fail,
    {
      ack: t.fail,
      nack: (job, allUpTo, requeue) => {
        t.notOk(allUpTo)
        t.notOk(requeue)
      }
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'unimplemented-job' }))
    }
  )
})

test('worker throws away unimplemented job action', async t => {
  t.plan(2)

  const worker = proxyquire('../../lib/worker', {
    [jobPath('unimplemented-job')]: () => {
      throw new Error('not implemented')
    }
  })

  await worker(
    t.fail,
    {
      ack: t.fail,
      nack: (job, allUpTo, requeue) => {
        t.notOk(allUpTo)
        t.notOk(requeue)
      }
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'unimplemented-job' }))
    }
  )
})

test('worker requeues job on error, then throws away', async t => {
  t.plan(3)

  const worker = proxyquire('../../lib/worker', {
    [jobPath('failing-job')]: () => {
      throw new Error('something went wrong')
    }
  })

  await worker(
    t.fail,
    {
      ack: t.fail,
      nack: t.pass
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'failing-job' })),
      fields: {}
    }
  )

  await worker(
    t.fail,
    {
      ack: t.fail,
      nack: (job, allUpTo, requeue) => {
        t.notOk(allUpTo)
        t.notOk(requeue)
      }
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'failing-job' })),
      fields: {
        redelivered: true
      }
    }
  )
})

test('worker acks job on success w/o further work', async t => {
  t.plan(1)

  const worker = proxyquire('../../lib/worker', {
    [jobPath('successful-job')]: () => {}
  })

  await worker(
    t.fail,
    {
      ack: t.pass,
      nack: t.fail
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'successful-job' }))
    }
  )
})

test('worker schedules further jobs on success', async t => {
  t.plan(4)

  const worker = proxyquire('../../lib/worker', {
    [jobPath('successful-job')]: () => [
      {
        data: true,
        plan: 'free'
      },
      {
        data: true,
        plan: 'supporter'
      },
      {
        data: true
      },
      {
        data: false
      }
    ]
  })

  await worker(
    t.pass,
    {
      ack: t.pass,
      nack: t.fail
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'successful-job' }))
    }
  )
})

test('worker requeues job on scheduling error, then throws away', async t => {
  t.plan(3)

  const worker = proxyquire('../../lib/worker', {
    [jobPath('failing-schedule')]: () => [
      {
        data: true
      },
      {
        data: true
      }
    ]
  })

  await worker(
    () => {
      throw new Error('scheduling fail')
    },
    {
      ack: t.fail,
      nack: t.pass
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'failing-schedule' })),
      fields: {}
    }
  )

  await worker(
    () => {
      throw new Error('scheduling fail')
    },
    {
      ack: t.pass,
      nack: (job, allUpTo, requeue) => {
        t.notOk(allUpTo)
        t.notOk(requeue)
      }
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'failing-schedule' })),
      fields: {
        redelivered: true
      }
    }
  )
})

tearDown(() => require('../../lib/statsd').close())
