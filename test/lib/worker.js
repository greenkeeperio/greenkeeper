const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('worker', () => {
  const emptyScheduleJob = () => {}

  beforeAll(async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: 'worker_111',
      installation: 'worker_111'
    })
    await repositories.put({
      _id: 'worker_111',
      fullName: 'lisa/monorepo'
    })
  })

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    require('../../lib/statsd').close()
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, 'worker_111'),
      removeIfExists(repositories, 'worker_111')
    ])
  })

  test('worker throws away unimplemented job', async () => {
    expect.assertions(3)

    const worker = require('../../lib/worker')

    await worker(
      emptyScheduleJob,
      {
        ack: () => {},
        nack: (job, allUpTo, requeue) => {
          const jobResult = JSON.parse(job.content.toString())
          expect(jobResult.name).toEqual('unimplemented-job')
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
    expect.assertions(4)

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
      emptyScheduleJob,
      {
        ack: () => {},
        nack: (job, allUpTo, requeue) => {
          const jobResult = JSON.parse(job.content.toString())
          expect(jobResult.name).toEqual('unimplemented-job')
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
    expect.assertions(5)

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
      emptyScheduleJob,
      {
        ack: () => {},
        nack: (job) => {
          const jobResult = JSON.parse(job.content.toString())
          expect(jobResult.name).toEqual('failing-job')
        }
      },
      {
        content: Buffer.from(JSON.stringify({
          name: 'failing-job', accountId: 123
        })),
        fields: {}
      }
    )

    await worker(
      emptyScheduleJob,
      {
        ack: () => {},
        nack: (job, allUpTo, requeue) => {
          const jobResult = JSON.parse(job.content.toString())
          expect(jobResult.name).toEqual('failing-job')
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

    const invalidConfigJob = {
      fields: {redelivered: false},
      content: Buffer.from(JSON.stringify({
        name: 'invalid-config-file',
        repositoryId: 'worker_111',
        accountId: 'worker_111',
        messages: ['The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).']
      }))
    }
    jest.mock('../../jobs/invalid-config-file', () => () => true)
    const worker = require('../../lib/worker')

    await worker(
      emptyScheduleJob,
      {
        ack: (arg) => {
          const job = JSON.parse(arg.content.toString())
          expect(job.name).toEqual('invalid-config-file')
          expect(job.accountId).toEqual('worker_111')
        },
        nack: () => {}
      },
      invalidConfigJob
    )
  })

  test('worker schedules further jobs on success', async () => {
    expect.assertions(3)

    const installationJob = {
      fields: {redelivered: false},
      content: Buffer.from(JSON.stringify({
        name: 'create-version-branch',
        repositoryId: '222',
        accountId: 222
      }))
    }
    jest.mock('../../jobs/create-version-branch', () => {
      return async () => [
        {
          data: {
            name: 'create-branch',
            repositoryId: 'worker_111',
            accountId: 'worker_111'
          }
        },
        {
          data: {
            name: 'create-branch',
            repositoryId: 'worker_111',
            accountId: 'worker_111'
          }
        }

      ]
    })
    const worker = require('../../lib/worker')

    await worker(
      (data) => {
        const job = JSON.parse(data.toString())
        expect(job.name).toEqual('create-branch')
      },
      {
        ack: (arg) => {
          const job = JSON.parse(arg.content.toString())
          expect(job.name).toEqual('create-version-branch')
        },
        nack: () => {}
      },
      installationJob
    )
  })

  test('worker schedules further monorepo-supervisor jobs on success', async () => {
    expect.assertions(7)

    const monorepoSupervisorJobData = { content: Buffer.from(JSON.stringify({name: 'monorepo-supervisor'})) }

    jest.mock('../../jobs/monorepo-supervisor', () => {
      return async () => [
        {
          data: {
            name: 'registry-change',
            dependency: 'jest'
          }
        },
        {
          data: {
            name: 'registry-change',
            dependency: 'angular'
          }
        },
        {
          data: {
            name: 'registry-change',
            dependency: 'pouchdb'
          }
        }
      ]
    })

    const worker = require('../../lib/worker')

    await worker(
      (data) => {
        const job = JSON.parse(data.toString())
        expect(job.name).toEqual('registry-change')
        expect(['jest', 'angular', 'pouchdb'].includes(job.dependency)).toBeTruthy()
      },
      {
        ack: (arg) => {
          const job = JSON.parse(arg.content.toString())
          expect(job.name).toEqual('monorepo-supervisor')
        },
        nack: () => {}
      },
      monorepoSupervisorJobData
    )
  })

  test('worker requeues job on scheduling error, then throws away', async () => {
    expect.assertions(7)

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
        ack: () => {},
        nack: (job, allUpTo, requeue) => {
          const jobRes = JSON.parse(job.content.toString())
          expect(jobRes.name).toEqual('failing-schedule')
          expect(allUpTo).toBeFalsy()
          expect(requeue).toBeFalsy()
        }
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
        ack: () => {},
        nack: (job, allUpTo, requeue) => {
          const jobRes = JSON.parse(job.content.toString())
          expect(jobRes.name).toEqual('failing-schedule')
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
      emptyScheduleJob,
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
})
