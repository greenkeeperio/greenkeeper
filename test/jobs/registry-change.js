const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const registryChange = require('../../jobs/registry-change.js')

describe('registry change create jobs', async () => {
  beforeAll(async() => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: '999',
        installation: 37,
        plan: 'free'
      }),
      repositories.put({
        _id: '888',
        enabled: true,
        type: 'repository',
        fullName: 'owner/repo',
        accountId: '999',
        packages: {
          'package.json': {
            dependencies: {
              standard: '1.0.0'
            }
          }
        }
      }),
      repositories.put({
        _id: '777',
        type: 'repository',
        fullName: 'owner/another',
        accountId: '999',
        packages: {
          'package.json': {
            dependencies: {
              standard: '1.0.0'
            }
          }
        }
      }),
      npm.put({
        _id: 'standard',
        distTags: {
          latest: '1.0.0'
        }
      }),
      npm.put({
        _id: 'eslint',
        distTags: {
          latest: '1.0.0'
        }
      })
    ])
  })

  test('registry change create job', async () => {
    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(1)
    const job = newJobs[0].data
    expect(job.repositoryId).toEqual('888')
    expect(job.distTag).toEqual('latest')
    expect(job.private).toBeFalsy()
  })

  test('registry change skip already processed version', async () => {
    const newJob = await registryChange({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJob).toBeFalsy()
  })

  test('registry change skip distTags other than latest', async () => {
    const newJob = await registryChange({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0',
        next: '8.0.1'
      },
      versions: {
        '8.0.1': {},
        '8.0.0': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJob).toBeFalsy()
  })

  test('registry change skip peerDependencies', async () => {
    const { repositories } = await dbs()

    expect.assertions(1)
    await repositories.put({
      _id: '776',
      enabled: true,
      type: 'repository',
      fullName: 'owner/repo2',
      accountId: '999',
      packages: {
        'package.json': {
          peerDependencies: {
            eslint: '1.0.0'
          }
        }
      }
    })

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'eslint',
      distTags: {
        latest: '9.0.0'
      },
      versions: {
        '9.0.0': {
          gitHead: 'b75aeb1'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(0)
  })

  test('registry change updates dependencies if duplicated as devDependencies', async () => {
    const { repositories } = await dbs()

    expect.assertions(2)
    await repositories.put({
      _id: '775',
      enabled: true,
      type: 'repository',
      fullName: 'owner/repo3',
      accountId: '999',
      packages: {
        'package.json': {
          dependencies: {
            eslint: '1.0.0'
          },
          devDependencies: {
            eslint: '1.0.0'
          }
        }
      }
    })

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'eslint',
      distTags: {
        latest: '10.0.0'
      },
      versions: {
        '10.0.0': {
          gitHead: 'b75aeb3'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(1)
    expect(newJobs[0].data.type).toEqual('dependencies')
  })

  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, '999'),
      removeIfExists(repositories, '775', '776', '777', '888'),
      removeIfExists(npm, 'standard', 'eslint')
    ])
  })
})
