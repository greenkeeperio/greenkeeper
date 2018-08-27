const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const registryChange = require('../../jobs/registry-change.js')

describe('registry change create jobs', async () => {
  beforeAll(async () => {
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
              standard: '1.0.0',
              'betazed': '1.0.0-beta.1'
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
      }),
      npm.put({
        _id: 'betazed',
        distTags: {
          latest: '1.0.0-beta.1'
        }
      }),
      npm.put({
        _id: 'kronos',
        distTags: {
          latest: '1.0.0-beta.1'
        }
      })
    ])
  })

  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, '999', '123-two-packages', '123-two-groups', '123-two-repos'),
      removeIfExists(repositories, '775', '776', '777', '888', '123-monorepo', '123-monorepo-two-groups', 'rg-no-monorepo', 'rg-monorepo', 'beta-monorepo'),
      removeIfExists(npm, 'standard', 'eslint', 'lodash', 'redux', 'betazed', 'kronos')
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
    expect(job.version).toEqual('8.0.0')
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

  test('registry change skip prereleases in latest', async () => {
    const newJob = await registryChange({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0-beta.4',
        next: '8.0.1'
      },
      versions: {
        '8.0.1': {},
        '8.0.0-beta.4': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJob).toBeFalsy()
  })

  test('registry change dont skip prereleases in latest for user using prereleases already', async () => {
    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'betazed',
      distTags: {
        latest: '8.0.0-beta.4',
        next: '8.0.1'
      },
      versions: {
        '8.0.1': {},
        '8.0.0-beta.4': {
          gitHead: 'happycow'
        },
        '1.0.0-beta.1': {
          gitHead: 'happybetacow'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(1)
    const newJob = newJobs[0].data
    expect(newJob.name).toBe('create-version-branch')
    expect(newJob.dependency).toBe('betazed')
    expect(newJob.version).toBe('8.0.0-beta.4')
    expect(newJob.repositoryId).toBe('888')
    expect(newJob.type).toBe('dependencies')
    expect(newJob.oldVersion).toBe('1.0.0-beta.1')
    expect(newJob.oldVersionResolved).toBe('1.0.0-beta.1')
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

  test('creates one monorepo job for a user who uses prereleases', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: 'beta-monorepo',
        enabled: true,
        type: 'repository',
        fullName: 'ilse/monorepo',
        accountId: '123-two-repos',
        packages: {
          'package.json': {
            dependencies: {
              redux: '1.0.0',
              kronos: '1.0.0-beta.1'
            }
          },
          'frontend/package.json': {
            dependencies: {
              redux: '1.0.0',
              kronos: '1.0.0-beta.1'
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
      })
    ])

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'kronos',
      distTags: {
        latest: '8.0.0-beta.8'
      },
      versions: {
        '8.0.0-beta.8': {
          gitHead: 'tomato'
        },
        '1.0.0-beta.1': {
          gitHead: 'tomato'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    expect(newJobs).toHaveLength(2)
    const firstMonorepoJob = newJobs[0].data
    const scndMonorepoJob = newJobs[1].data

    expect(firstMonorepoJob.name).toBe('create-group-version-branch')
    expect(firstMonorepoJob.group).toMatchObject({ frontend: { packages: ['frontend/package.json'] } })
    expect(firstMonorepoJob.version).toBe('8.0.0-beta.8')
    expect(firstMonorepoJob.dependency).toBe('kronos')
    expect(firstMonorepoJob.oldVersionResolved).toBe('1.0.0-beta.1')
    expect(firstMonorepoJob.installation).toBe(10409)
    expect(firstMonorepoJob.accountId).toBe('123-two-repos')
    expect(firstMonorepoJob.oldVersion).toBe('1.0.0-beta.1')

    expect(scndMonorepoJob.name).toBe('create-group-version-branch')
    expect(scndMonorepoJob.group).toMatchObject({ backend: { packages: ['package.json'] } })
    expect(scndMonorepoJob.version).toBe('8.0.0-beta.8')
    expect(scndMonorepoJob.dependency).toBe('kronos')
    expect(scndMonorepoJob.oldVersionResolved).toBe('1.0.0-beta.1')
    expect(scndMonorepoJob.oldVersion).toBe('1.0.0-beta.1')
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
              'kroko': '1.0.0',
              'kroko-dile': '1.0.0',
              'colors': '1.0.0',
              'colors-blue': '1.0.0',
              'bulldog': '1.0.0'
            }
          }
        }
      }),
      npm.put({
        _id: 'kroko',
        distTags: {
          latest: '1.0.0'
        }
      }),
      npm.put({
        _id: 'kroko-dile',
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
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })
  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, 'monorepo-release-1'),
      removeIfExists(repositories, 'mr-1', 'mono-nuclear-100'),
      removeIfExists(npm, 'react', 'kroko', 'kroko-dile', 'colors', 'colors-blue', 'pug', 'bulldog', 'enzyme-adapter-utils')
    ])
  })

  test('monorepo-release: package is part of uncomplete monorepoDefinition', async () => {
    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'react',
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
    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        const monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          colors: ['colors', 'colors-blue']
        })
        return newDef
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
    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        const monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          dogs: ['bulldog', 'pug']
        })
        return newDef
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

  test.only('monorepo-release: package is part of complete monorepoDefinition, but repo is not using this package', async () => {
    const { repositories, npm } = await dbs()
    repositories.put({
      _id: 'mono-nuclear-100',
      type: 'repository',
      accountId: 'monorepo-release-1',
      fullName: 'nukeop/nuclear',
      enabled: true,
      packages: {
        'package.json': {
          devDependencies: {
            'enzyme': '^3.3.0',
            'enzyme-adapter-react-16': '^1.5.0'
          }
        }
      }
    })
    npm.put({
      '_id': 'enzyme-adapter-utils',
      'distTags': {
        'next': '1.0.0-beta.7',
        'latest': '1.5.0'
      },
      'versions': {
        '1.4.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.5.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        }
      }
    })
    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        const monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          enzyme: [
            'enzyme',
            'enzyme-adapter-react-13',
            'enzyme-adapter-react-14',
            'enzyme-adapter-react-15.4',
            'enzyme-adapter-react-15',
            'enzyme-adapter-react-16',
            'enzyme-adapter-utils',
            'enzyme-adapter-react-helper'
          ]
        })
        return newDef
      })
      const lib = require.requireActual('../../lib/monorepo')
      return lib
    })

    const registryChange = require('../../jobs/registry-change.js')

    const newJobs = await registryChange({
      name: 'registry-change',
      dependency: 'enzyme-adapter-utils',
      distTags: {
        'next': '1.0.0-beta.7',
        'latest': '1.6.0'
      },
      versions: {
        '1.6.0': {
          gitHead: 'wau'
        },
        '1.5.0': {
          gitHead: 'woof'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    // a version branch should be created
    expect(newJobs).toHaveLength(1)
    const job = newJobs[0].data
    console.log('job', job)
    expect(job.name).toBe('create-version-branch')
    expect(job.repositoryId).toBe('mono-nuclear-100')
    // ⚠️ We’d want a cvb payload that runs updates for all updated dependencies from this dependency’s monorepo release group, but not for this dep itself.
    // Every update should use its _actual_ newest version, and each of them also has their own oldVersion
    expect(job.dependency).toBe('pug')
  })

  /*
    Test case from a bug where `@storybook/vue` received an update (as part of the `storybook` monorepo definition) on a monorepo and registry-change started `create-version-branch` instead of `create-group-version-branch`.

    The reason was that the repo had no root-level `package.json`, and only had `@storybook` deps in one of the multiple `package.json` files. It also didn’t depend on `@storybook/vue` directly, only on other `@storybook` packages, but that wan’t relevant in this case.
  */
  test('monorepo-release: package is part of complete monorepoDefinition, but is only targeting a single non-root package.json', async () => {
    const { installations, repositories, npm } = await dbs()

    await Promise.all([
      installations.put({
        _id: '11062018-bug-1-installation',
        installation: 11062018,
        plan: 'free'
      }),
      repositories.put({
        _id: '11062018-bug-1-id',
        enabled: true,
        type: 'repository',
        fullName: 'calvin/hobbes',
        accountId: '11062018-bug-1-installation',
        packages: {
          'admin/package.json': {
            name: 'cuistot-react-admin',
            dependencies: {
              '@material-ui/core': '1.0.0',
              '@material-ui/icons': '1.0.0'
            }
          },
          'backend/package.json': {
            name: 'cuistot-back',
            dependencies: {
              'aws-sdk': '^2.220.1',
              'babel-polyfill': '^6.26.0'
            },
            devDependencies: {
              'babel-core': '^6.26.3',
              'babel-loader': '^7.1.4'
            }
          },
          'frontend/package.json': {
            name: 'cuistot-front',
            dependencies: {
              '@jaredpalmer/after': '^1.3.1',
              '@material-ui/core': '^1.2.0',
              '@material-ui/docs': '^1.0.0-alpha.3',
              '@material-ui/icons': '^1.1.0',
              'apollo-cache-inmemory': '^1.2.2'
            },
            devDependencies: {
              '@storybook/addon-actions': '^4.0.0-alpha.8',
              '@storybook/addon-info': '^3.4.6',
              '@storybook/addon-knobs': '^4.0.0-alpha.8',
              '@storybook/addon-options': '^4.0.0-alpha.8',
              '@storybook/react': '^4.0.0-alpha.8',
              '@types/jest': '^23.0.0',
              '@types/node': '10.1.4'
            }
          }
        },
        greenkeeper: {
          groups: {
            default: {
              packages: [
                'admin/package.json',
                'backend/package.json',
                'frontend/package.json'
              ]
            }
          }
        }
      }),
      npm.put({
        _id: '@storybook/vue',
        distTags: {
          alpha: '4.0.0-alpha.9',
          latest: '3.4.6',
          rc: '3.4.0-rc.4'
        }
      })
    ])

    const registryChange = require('../../jobs/registry-change.js')

    const newJobs = await registryChange({
      dependency: '@storybook/vue',
      name: 'registry-change',
      distTags: {
        alpha: '4.0.0-alpha.9',
        latest: '3.4.7',
        rc: '3.4.0-rc.4'
      },
      versions: {
        '3.4.5': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        },
        '4.0.0-alpha.7': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        },
        '3.4.6': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        },
        '4.0.0-alpha.8': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        },
        '3.4.7': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        },
        '4.0.0-alpha.9': {
          repository: {
            type: 'git',
            url: 'git+https://github.com/storybooks/storybook.git'
          }
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    // a group version branch should be created
    expect(newJobs).toHaveLength(1)
    const job = newJobs[0].data
    expect(job.name).toBe('create-group-version-branch')
    expect(job.repositoryId).toBe('11062018-bug-1-id')
    expect(job.dependency).toBe('@storybook/vue') // this might have to change?
  })
})
