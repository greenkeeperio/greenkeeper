const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const registryChange = require('../../jobs/registry-change.js')

describe('registry change create jobs', async () => {
  beforeAll(async() => {
    jest.setTimeout(10000)
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

  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, '999', '123-two-packages', '123-two-groups', '123-two-repos'),
      removeIfExists(repositories, '775', '776', '777', '888', '123-monorepo', '123-monorepo-two-groups', 'rg-no-monorepo', 'rg-monorepo'),
      removeIfExists(npm, 'standard', 'eslint', 'lodash', 'redux')
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
    expect(job.accountId).toEqual('999')
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

  test('registry change creates one monorepo job for group', async () => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: '123-two-packages',
        installation: 87,
        plan: 'free'
      }),
      repositories.put({
        _id: '123-monorepo',
        enabled: true,
        type: 'repository',
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        packages: {
          'package.json': {
            dependencies: {
              react: '1.0.0'
            }
          },
          'backend/package.json': {
            dependencies: {
              react: '1.0.0'
            }
          }
        },
        greenkeeper: {
          'groups': {
            'default': {
              'packages': [
                'package.json',
                'backend/package.json'
              ]
            }
          }
        }
      }),
      npm.put({
        _id: 'react',
        distTags: {
          latest: '1.0.0'
        }
      })
    ])

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'react',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'deadbeef'
        },
        '1.0.0': {
          gitHead: 'deadbeet'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(1)
    expect(newJobs[0].data.name).toEqual('create-group-version-branch')
    expect(newJobs[0].data.accountId).toEqual('123-two-packages')
  })

  test('creates two monorepo jobs for two groups', async () => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: '123-two-groups',
        installation: 14532,
        plan: 'free'
      }),
      repositories.put({
        _id: '123-monorepo-two-groups',
        enabled: true,
        type: 'repository',
        fullName: 'ilse/monorepo',
        accountId: '123-two-groups',
        packages: {
          'package.json': {
            dependencies: {
              lodash: '1.0.0'
            }
          },
          'frontend/package.json': {
            dependencies: {
              lodash: '1.0.0'
            }
          }
        },
        greenkeeper: {
          'groups': {
            'frontend': {
              'packages': [
                'frontend/package.json'
              ]
            },
            'backend': {
              'packages': [
                'package.json'
              ]
            }
          }
        }
      }),
      npm.put({
        _id: 'lodash',
        distTags: {
          latest: '1.0.0'
        }
      })
    ])

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'lodash',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'deadbeef'
        },
        '1.0.0': {
          gitHead: 'deadbeet'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(2)
    expect(newJobs[0].data.name).toEqual('create-group-version-branch')
    expect(newJobs[0].data.monorepo).toHaveLength(1)
    expect(newJobs[0].data.monorepo[0].value.filename).toEqual('frontend/package.json')
    expect(newJobs[0].data.accountId).toEqual('123-two-groups')
    expect(newJobs[1].data.name).toEqual('create-group-version-branch')
    expect(newJobs[1].data.monorepo).toHaveLength(1)
    expect(newJobs[1].data.monorepo[0].value.filename).toEqual('package.json')
    expect(newJobs[1].data.accountId).toEqual('123-two-groups')
  })

  test('creates one monorepo and one non-monorepo-job', async () => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: '123-two-repos',
        installation: 10409,
        plan: 'free'
      }),
      repositories.put({
        _id: 'rg-no-monorepo',
        enabled: true,
        type: 'repository',
        fullName: 'amy/no-monorepo',
        accountId: '123-two-repos',
        packages: {
          'package.json': {
            dependencies: {
              redux: '1.0.0'
            }
          }
        }
      }),
      repositories.put({
        _id: 'rg-monorepo',
        enabled: true,
        type: 'repository',
        fullName: 'ilse/monorepo',
        accountId: '123-two-repos',
        packages: {
          'package.json': {
            dependencies: {
              redux: '1.0.0'
            }
          },
          'frontend/package.json': {
            dependencies: {
              redux: '1.0.0'
            }
          }
        },
        greenkeeper: {
          'groups': {
            'frontend': {
              'packages': [
                'frontend/package.json'
              ]
            },
            'backend': {
              'packages': [
                'package.json'
              ]
            }
          }
        }
      }),
      npm.put({
        _id: 'redux',
        distTags: {
          latest: '1.0.0'
        }
      })
    ])

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'redux',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'tomato'
        },
        '1.0.0': {
          gitHead: 'tomato'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(3)
    const noMonorepoJob = newJobs[2].data
    const firstMonorepoJob = newJobs[0].data
    const scndMonorepoJob = newJobs[1].data

    // no monorepo job
    expect(noMonorepoJob.name).toEqual('create-version-branch')
    expect(noMonorepoJob.monorepo).toBeFalsy()
    expect(noMonorepoJob.accountId).toEqual('123-two-repos')

    // monorepo jobs
    expect(firstMonorepoJob.name).toEqual('create-group-version-branch')
    expect(noMonorepoJob.accountId).toEqual('123-two-repos')
    expect(firstMonorepoJob.monorepo).toHaveLength(1)
    expect(firstMonorepoJob.monorepo[0].key).toEqual('redux')
    expect(firstMonorepoJob.monorepo[0].value.filename).toEqual('frontend/package.json')

    expect(scndMonorepoJob.name).toEqual('create-group-version-branch')
    expect(scndMonorepoJob.monorepo).toHaveLength(1)
    expect(scndMonorepoJob.monorepo[0].key).toEqual('redux')
    expect(scndMonorepoJob.monorepo[0].value.filename).toEqual('package.json')
    expect(scndMonorepoJob.accountId).toEqual('123-two-repos')
  })
})

describe('monorepo-release: registry change create jobs', async () => {
  beforeAll(async () => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: 'monorepo-release-1',
        installation: 1,
        plan: 'free'
      }),
      repositories.put({
        _id: 'mr-1',
        type: 'repository',
        fullName: 'owner/another',
        accountId: 'monorepo-release-1',
        enabled: true,
        packages: {
          'package.json': {
            dependencies: {
              pouchdb: '1.0.0',
              'pouchdb-core': '1.0.0',
              colors: '1.0.0',
              'colors-blue': '1.0.0',
              bulldog: '1.0.0'
            }
          }
        }
      }),
      npm.put({
        _id: 'pouchdb',
        distTags: {
          latest: '1.0.0'
        }
      }),
      npm.put({
        _id: 'pouchdb-core',
        distTags: {
          latest: '1.0.0'
        }
      }),
      npm.put({
        _id: 'colors',
        distTags: {
          latest: '2.0.0'
        }
      }),
      npm.put({
        _id: 'colors-blue',
        distTags: {
          latest: '1.0.0'
        }
      }),
      npm.put({
        _id: 'bulldog',
        distTags: {
          latest: '2.0.0'
        }
      }),
      npm.put({
        _id: 'pug',
        distTags: {
          latest: '1.0.0'
        }
      })
    ])
  })
  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, 'monorepo-release-1'),
      removeIfExists(repositories, 'mr-1'),
      removeIfExists(npm, 'pouchdb', 'pouchdb-core', 'colors', 'colors-blue')
    ])
  })

  test('monorepo-release: package is part of uncomplete monorepoDefinition', async () => {
    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'pouchdb',
      enabled: true,
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '2.0.0': {
          gitHead: 'kangaroo'
        },
        '1.0.0': {
          gitHead: 'koala'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    // no branch should be created
    expect(newJobs).toBeFalsy()
  })

  test('monorepo-release: package is part of complete monorepoDefinition', async () => {
    jest.resetModules()
    jest.clearAllMocks()

    jest.mock('../../lib/monorepo', () => {
      jest.mock('../../utils/monorepo-definitions', () => {
        const { monorepoDefinitions } = require.requireActual('../../utils/monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          colors: ['colors', 'colors-blue']
        })
        return { monorepoDefinitions: newDef }
      })
      const lib = require.requireActual('../../lib/monorepo')
      return lib
    })

    const registryChange = require('../../jobs/registry-change.js')

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'colors-blue',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '2.0.0': {
          gitHead: 'smurf'
        },
        '1.0.0': {
          gitHead: 'sky'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    // a version branch should be created
    expect(newJobs).toHaveLength(1)
    const job = newJobs[0].data
    expect(job.name).toBe('create-version-branch')
    expect(job.dependency).toBe('colors-blue') // this might have to change?
    expect(job.repositoryId).toBe('mr-1')
  })

  test('monorepo-release: package is part of complete monorepoDefinition, but is not using all the packages', async () => {
    jest.resetModules()
    jest.clearAllMocks()

    jest.mock('../../lib/monorepo', () => {
      jest.mock('../../utils/monorepo-definitions', () => {
        const { monorepoDefinitions } = require.requireActual('../../utils/monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          dogs: ['bulldog', 'pug']
        })
        return { monorepoDefinitions: newDef }
      })
      const lib = require.requireActual('../../lib/monorepo')
      return lib
    })

    const registryChange = require('../../jobs/registry-change.js')

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'pug',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '2.0.0': {
          gitHead: 'wau'
        },
        '1.0.0': {
          gitHead: 'woof'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    // a version branch should be created
    expect(newJobs).toHaveLength(1)
    const job = newJobs[0].data
    expect(job.name).toBe('create-version-branch')
    expect(job.repositoryId).toBe('mr-1')
    expect(job.dependency).toBe('pug') // this might have to change?
  })
})
