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

  const worker = require('../../lib/worker')
  jest.mock('path', () => {
    return {
      ...require.requireActual('path'),
      jobPath: (job) => {
        throw new Error('not implemented')
      }
    }
  })
  const path = require('path')

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

  const worker = require('../../lib/worker')
  jest.mock('path', () => {
    return {
      ...require.requireActual('path'),
      jobPath: (job) => {
        throw new Error('something went wrong')
      }
    }
  })
  const path = require('path')

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

  const worker = require('../../lib/worker')
  jest.mock('path', () => {
    return {
      ...require.requireActual('path'),
      jobPath: () => {}
    }
  })
  const path = require('path')

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

  const worker = require('../../lib/worker')
  jest.mock('path', () => {
    return {
      ...require.requireActual('path'),
      jobPath: (job) => [
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
    }
  })
  const path = require('path')

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

test('worker requeues job on scheduling error, then throws away', async () => {
  expect.assertions(5)

  const worker = require('../../lib/worker')
  jest.mock('path', () => {
    return {
      ...require.requireActual('path'),
      jobPath: (job) => [
        {
          data: true
        },
        {
          data: true
        }
      ]
    }
  })
  const path = require('path')

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
