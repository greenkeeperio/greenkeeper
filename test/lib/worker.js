beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

afterAll(() => require('../../lib/statsd').close())

test('worker throws away unimplemented job', async () => {
  expect.assertions(2)

  const worker = require('../../lib/worker')

  await worker(
    expect.anything(),
    {
      ack: expect.anything(),
      nack: (job, allUpTo, requeue) => {
        expect(allUpTo).toBeFalsy()
        expect(requeue).toBeFalsy()
      }
    },
    {
      content: Buffer.from(JSON.stringify({ name: 'unimplemented-job' }))
    }
  )
})

test('worker throws away unimplemented job action', async () => {
  expect.assertions(3)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => {
      throw new Error('not implemented')
    }
    return path
  })
  const path = require('path')
  const worker = require('../../lib/worker')

  expect(() => {
    path.jobPath('unimplemented-job')
  }).toThrow('not implemented')

  await worker(
    expect.anything(),
    {
      ack: expect.anything(),
      nack: (job, allUpTo, requeue) => {
        expect(allUpTo).toBeFalsy()
        expect(requeue).toBeFalsy()
      }
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'unimplemented-job', accountId: 123
      }))
    }
  )
})

test('worker requeues job on error, then throws away', async () => {
  expect.assertions(4)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => {
      throw new Error('something went wrong')
    }
    return path
  })
  const path = require('path')
  const worker = require('../../lib/worker')

  expect(() => {
    path.jobPath('failing-job')
  }).toThrow('something went wrong')

  await worker(
    expect.anything(),
    {
      ack: expect.anything(),
      nack: () => expect(true).toBeTruthy()
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'failing-job', accountId: 123
      })),
      fields: {}
    }
  )

  await worker(
    expect.anything(),
    {
      ack: expect.anything(),
      nack: (job, allUpTo, requeue) => {
        expect(allUpTo).toBeFalsy()
        expect(requeue).toBeFalsy()
      }
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'failing-job', accountId: 123
      })),
      fields: {
        redelivered: true
      }
    }
  )
})

test('worker acks job on success w/o further work', async () => {
  expect.assertions(2)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => {}
    return path
  })
  const path = require('path')
  const worker = require('../../lib/worker')

  expect(() => {
    path.jobPath('successful-job')
  }).not.toThrow()

  await worker(
    expect.anything(),
    {
      ack: expect(true).toBeTruthy(),
      nack: () => expect.anything()
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'successful-job',
        repository: {
          owner: {
            id: 111
          },
          full_name: 'testOrg/testRepo'
        }
      }))
    }
  )
})

test('worker schedules further jobs on success', async () => {
  expect.assertions(3)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => [
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
    return path
  })
  const path = require('path')
  const worker = require('../../lib/worker')

  expect(() => {
    path.jobPath('successful-job')
  }).not.toThrow()

  await worker(
    expect(true).toBeTruthy(),
    {
      ack: expect(true).toBeTruthy(),
      nack: () => expect.anything()
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'successful-job', accountId: 234
      }))
    }
  )
})

test('worker schedules further monorepo-supervisor jobs on success', async () => {
  expect.assertions(4)

  const monorepoSupervisorJobData = {
    content: Buffer.from(JSON.stringify({name: 'monorepo-supervisor'}))
  }
  const monorepoSupervisorJobs = [
    {
      name: 'registry-change',
      dependency: 'jest'
    },
    {
      name: 'registry-change',
      dependency: 'angular'
    },
    {
      name: 'registry-change',
      dependency: 'pouchdb'
    }
  ]

  jest.mock('../../jobs/monorepo-supervisor', () => {
    return async () => monorepoSupervisorJobs
  })

  const worker = require('../../lib/worker')

  const newJobs = await worker(
    expect(true).toBeTruthy(),
    {
      ack: () => { expect(true).toBeTruthy() },
      nack: () => expect.anything()
    },
    monorepoSupervisorJobData
  )

  expect(newJobs).toHaveLength(3)
  expect(newJobs).toMatchObject(monorepoSupervisorJobs)
})

test('worker requeues job on scheduling error, then throws away', async () => {
  expect.assertions(5)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => [
      {
        data: true
      },
      {
        data: true
      }
    ]
    return path
  })
  const path = require('path')
  const worker = require('../../lib/worker')

  expect(() => {
    path.jobPath('failing-schedule')
  }).not.toThrow()

  await worker(
    () => {
      throw new Error('scheduling fail')
    },
    {
      ack: expect.anything(),
      nack: () => expect(true).toBeTruthy()
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'failing-schedule', accountId: 233
      })),
      fields: {}
    }
  )

  await worker(
    () => {
      throw new Error('scheduling fail')
    },
    {
      ack: expect(true).toBeTruthy(),
      nack: (job, allUpTo, requeue) => {
        expect(allUpTo).toBeFalsy()
        expect(requeue).toBeFalsy()
      }
    },
    {
      content: Buffer.from(JSON.stringify({
        name: 'failing-schedule', accountId: 344
      })),
      fields: {
        redelivered: true
      }
    }
  )
})

test('worker measures runtime and sends it to statsd with tag', async () => {
  expect.assertions(4)

  jest.mock('path', () => {
    const path = require.requireActual('path')
    path.jobPath = (job) => [
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
    return path
  })
  const path = require('path')

  expect(() => {
    path.jobPath('update-payments')
  }).not.toThrow()

  jest.mock('../../lib/statsd', () => {
    return {
      increment: jest.fn(),
      gauge: jest.fn()
    }
  })
  const statsd = require('../../lib/statsd')

  const worker = require('../../lib/worker')
  await worker(
    expect.anything(),
    {
      ack: () => {},
      nack: () => {}
    }, {
      content: Buffer.from(JSON.stringify({ name: 'update-payments', accountId: '123' })),
      fields: ['hello']

    }
  )
  expect(statsd.gauge).toHaveBeenCalled()
  expect(statsd.gauge).toHaveBeenCalledTimes(1)
  expect(statsd.gauge).toHaveBeenCalledWith('job_runtime', expect.any(Number), {tag: 'update-payments'})
})
