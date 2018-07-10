const nock = require('nock')
const _ = require('lodash')

const enterprisePrivateKey = require('../../helpers/enterprise-private-key')
const dbs = require('../../../lib/dbs')
const removeIfExists = require('../../helpers/remove-if-exists')
const { cleanCache, requireFresh } = require('../../helpers/module-cache-helpers')
// requireFresh uses a path relative to THEIR path, that's why we use the resolved
// path here, making it a bit clearer which file we're actually requiring
const pathToWorker = require.resolve('../../../jobs/github-event/push')
const configFileContent = {
  groups: {
    default: {
      packages: [
        'package.json'
      ]
    }
  }
}
let defaultPrivateKey = process.env.PRIVATE_KEY

describe('github-event push', async () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    defaultPrivateKey ? process.env.PRIVATE_KEY = defaultPrivateKey : delete process.env.PRIVATE_KEY
    nock.cleanAll()
  })

  beforeAll(async () => {
    const { payments } = await dbs()

    await payments.put({
      _id: '123',
      plan: 'personal',
      stripeSubscriptionId: 'si123'
    })
  })

  afterAll(async () => {
    const { repositories, payments } = await dbs()

    await removeIfExists(repositories, '333', '444', '444A', '445', '445A', '446', '447', '448', '555',
      '444:branch:1234abcd', '444:branch:1234abce', '444A:branch:1234abcd', '444A:branch:1234abce')
    await removeIfExists(payments, '123')
  })

  test('package.json added/modified for a not enabled repo (333)', async () => {
    const { repositories } = await dbs()

    await repositories.put({
      _id: '333',
      fullName: 'finn/disabled',
      accountId: '123'
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/disabled/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/finn/disabled/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/finn/disabled/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({})
      })

    const newJob = await githubPush({
      installation: {
        id: 37
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['package.json', 'package-lock.json']
        }
      ],
      repository: {
        id: 333,
        full_name: 'finn/test',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-branch')
    expect(job.accountId).toEqual('123')
    expect(job.repositoryId).toEqual('333')

    const repo = await repositories.get('333')

    expect(repo.files['package.json'].length).toBeGreaterThan(0)
    expect(repo.files['package-lock.json'].length).toBeGreaterThan(0)
    expect(repo.files['npm-shrinkwrap.json']).toHaveLength(0)

    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.packages).toMatchObject(expectedPackages)

    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: subdirectory package.json was modified (555)', async () => {
    const { repositories } = await dbs()

    const myConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        }
      }
    }

    await repositories.put({
      _id: '555',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^0.9.0'
          }
        }
      },
      greenkeeper: {
        groups: {
          frontend: {
            packages: [
              'packages/frontend/package.json'
            ]
          }
        }
      }
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(myConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package-lock.json')
      .reply(200, {
        path: 'packages/frontend/package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({name: 'hallo'})
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/frontend/package.json', 'packages/frontend/package-lock.json']
        }
      ],
      repository: {
        id: 555,
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('555')
    expect(repo.files['package.json'].length).toBeGreaterThan(0)
    expect(repo.files['package-lock.json'].length).toBeGreaterThan(0)
    expect(repo.files['npm-shrinkwrap.json']).toHaveLength(0)

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json' ],
      'package-lock.json': [ 'packages/frontend/package-lock.json' ],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)

    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: subdirectory package.json, which is not listed in the config, was modified (555)', async () => {
    const { repositories } = await dbs()
    const githubPush = requireFresh(pathToWorker)
    const myConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        }
      }
    }
    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(myConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package-lock.json')
      .reply(200, {
        path: 'packages/frontend/package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({name: 'hallo'})
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b-yup',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/backend/package.json', 'packages/backend/package-lock.json']
        }
      ],
      repository: {
        id: 555,
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('555')
    expect(repo.files['package.json']).toHaveLength(1)
    expect(repo.files['package-lock.json']).toHaveLength(1)
    expect(repo.files['npm-shrinkwrap.json']).toHaveLength(0)

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json' ],
      'package-lock.json': [ 'packages/frontend/package-lock.json' ],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages['packages/backend/package.json']).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b-yup')
  })

  test('do branch cleanup on modify (444)', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '444',
          fullName: 'finn/test',
          accountId: '123',
          enabled: true,
          packages: {
            'package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^0.1.0'
              }
            }
          }
        },
        {
          _id: '444:branch:1234abcd',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '444',
          version: '2.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/lodash-2.0.0'
        },
        {
          _id: '444:branch:1234abce',
          type: 'branch',
          sha: '1234abce',
          repositoryId: '444',
          version: '3.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/lodash-3.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/38/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/test/contents/greenkeeper.json')
      .reply(404, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^2.0.0'
          }
        })
      })
      .delete('/repos/finn/test/git/refs/heads/greenkeeper/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/finn/test/git/refs/heads/greenkeeper/lodash-3.0.0')
      .reply(200, () => {
        // this should not happen
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 38
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab2b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['package.json']
        }
      ],
      repository: {
        id: 444,
        full_name: 'finn/test',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('444')
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^2.0.0'
        }
      }
    }
    expect(repo.packages).toMatchObject(expectedPackages)

    const branch = await repositories.get('444:branch:1234abcd')
    expect(branch.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab2b')
  })

  test('do branch cleanup on remove (444A)', async () => {
    const { repositories } = await dbs()
    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '444A',
          fullName: 'finn/test',
          accountId: '123',
          enabled: true,
          packages: {
            'package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^0.1.0'
              }
            }
          }
        },
        {
          _id: '444A:branch:1234abcd',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '444A',
          version: '2.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/lodash-2.0.0'
        },
        {
          _id: '444A:branch:1234abce',
          type: 'branch',
          sha: '1234abce',
          repositoryId: '444A',
          version: '3.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/lodash-3.0.0'
        }
      ])
    ])
    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/39/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/test/contents/greenkeeper.json')
      .reply(404, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            underscore: '*'
          }
        })
      })
      .delete('/repos/finn/test/git/refs/heads/greenkeeper/lodash-3.0.0')
      .reply(200, {})
      .delete('/repos/finn/test/git/refs/heads/greenkeeper/lodash-2.0.0')
      .reply(200, {})

    const newJob = await githubPush({
      installation: {
        id: 39
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab1b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['package.json']
        }
      ],
      repository: {
        id: '444A',
        full_name: 'finn/test',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })
    expect(newJob).toBeFalsy()

    const repo = await repositories.get('444A')
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          underscore: '*'
        }
      }
    }
    expect(repo.packages).toMatchObject(expectedPackages)

    const branch1 = await repositories.get('444A:branch:1234abcd')
    expect(branch1.referenceDeleted).toBeTruthy()
    const branch2 = await repositories.get('444A:branch:1234abce')
    expect(branch2.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab1b')
  })

  test('invalid package.json present (446)', async () => {
    const { repositories } = await dbs()

    await repositories.put({
      _id: '446',
      fullName: 'finn/enabled2',
      accountId: '123',
      enabled: true
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/40/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: Buffer.from('test').toString('base64')
      })

    const newJob = await githubPush({
      installation: {
        id: 40
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3c',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['package.json']
        }
      ],
      repository: {
        id: 446,
        full_name: 'finn/enabled2',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('446')
    expect(repo.enabled).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3c')
  })

  test('no relevant changes (445)', async () => {
    const { repositories } = await dbs()
    await repositories.put(
      {
        _id: '445',
        fullName: 'finn/enabled',
        accountId: '123',
        enabled: true
      }
    )
    const githubPush = requireFresh(pathToWorker)
    expect.assertions(1)

    nock('https://api.github.com')
      .post('/installations/41/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/test/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })

      .get('/repos/finn/test/contents/package.json')
      .reply(200, () => {
        // should not request package.json
      })
    const newJob = await githubPush({
      installation: {
        id: 41
      },
      ref: 'refs/heads/master',
      after: 'deadbeef',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['index.js'],
          modified: []
        }
      ],
      repository: {
        id: 445,
        full_name: 'finn/enabled',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })
    expect(newJob).toBeFalsy()
  })

  test('package.json deleted (445A)', async () => {
    const { repositories } = await dbs()
    await repositories.put(
      {
        _id: '445A',
        fullName: 'finn/enabled',
        accountId: '123',
        enabled: true
      }
    )
    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/enabled/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/finn/test/contents/package.json')
      .reply(404, {})

    const newJob = await githubPush({
      installation: {
        id: 42
      },
      ref: 'refs/heads/master',
      after: 'deadbeef',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['package.json'],
          modified: []
        }
      ],
      repository: {
        id: '445A',
        full_name: 'finn/enabled',
        name: 'test',
        owner: {
          login: 'finn'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('445A')
    expect(repo.packages).toMatchObject({})
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })

  test('package.json deleted on private repo within GKE (448)', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '448',
      fullName: 'finn/private',
      accountId: '123',
      enabled: true,
      private: true
    })
    process.env.IS_ENTERPRISE = true
    process.env.PRIVATE_KEY = enterprisePrivateKey
    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/private/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })

      .get('/repos/finn/private/contents/package.json')
      .reply(404, {})

    const newJob = await githubPush({
      installation: {
        id: 42
      },
      ref: 'refs/heads/master',
      after: 'deadbeef',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['package.json'],
          modified: []
        }
      ],
      repository: {
        id: 448,
        full_name: 'finn/private',
        name: 'private',
        owner: {
          login: 'finn'
        },
        private: true,
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('448')
    expect(repo.packages).toMatchObject({})
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })

  test('package.json deleted on private repo (447)', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '447',
      fullName: 'finn/private',
      accountId: '123',
      enabled: true,
      private: true
    })
    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finn/private/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/finn/private/contents/package.json')
      .reply(404, {})

    const newJob = await githubPush({
      installation: {
        id: 42
      },
      ref: 'refs/heads/master',
      after: 'deadbeef',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['package.json'],
          modified: []
        }
      ],
      repository: {
        id: 447,
        full_name: 'finn/private',
        name: 'private',
        owner: {
          login: 'finn'
        },
        private: true,
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('update-payments')

    const repo = await repositories.get('447')
    expect(repo.packages).toMatchObject({})
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })
})

describe('github-event push: monorepo', () => {
  beforeEach(() => {
    jest.resetModules()
    nock.cleanAll()
  })

  afterAll(async () => {
    const { repositories } = await dbs()

    await removeIfExists(repositories, '666', '3462',
      '777', '777:branch:1234abcd', '777:branch:1234abce', '777:branch:1234abcf', '777:branch:1234abcg',
      '777A', '777A:branch:1234abca', '777A:branch:1234abcb', '777A:branch:1234abcc',
      '888', '888:branch:1234abca', '888:branch:1234abcb',
      '999', '999:branch:1234abca', '999:branch:1234abcb',
      '1111',
      '1112', '1112:branch:1234abca', '1112:branch:1234abcb',
      '1113', '1113:branch:1234abca', '1113:branch:1234abcb',
      '1114', '1114:branch:1234abca', '1114:branch:1234abcb',
      '1115', '1115:branch:1234abca', '1115:branch:1234abcb',
      '1116', '1116:branch:1234abca', '1116:branch:1234abcb',
      '1117', '1117:branch:1234abca',
      '1118', '1118:branch:1234abca',
      'mga1', 'mga2', 'mga3', 'mgm1', 'mgm2', 'mgm3', 'mgm4', 'mgm5', 'too-many-packages')
  })

  test('monorepo: create no pull request for too many package.jsons', async () => {
    const huuuuuugeMonorepo = {}
    for (let i = 0; i <= 333; i++) {
      huuuuuugeMonorepo[i] = ('packages/' + i + '/package.json')
    }

    const newConfigFileContent = {
      groups: {
        default: {
          packages: [
            'packages/11/package.json',
            'packages/22/package.json',
            'packages/33/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await repositories.put(
      {
        _id: 'too-many-packages',
        fullName: 'hans/monorepo',
        accountId: '321',
        enabled: true,
        headSha: 'hallo',
        packages: huuuuuugeMonorepo
      }
    )

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/11/package.json')
      .reply(200, {
        path: 'packages/11/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/22/package.json')
      .reply(200, {
        path: 'packages/22/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['packages/22/package.json'],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'too-many-packages',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()
  })

  test('monorepo: 2 package.jsons in 2 groups modified (666)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await repositories.put({
      _id: '666',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^0.9.0'
          }
        },
        'packages/backend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^0.9.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/frontend/package.json', 'packages/backend/package.json']
        }
      ],
      repository: {
        id: 666,
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('666')

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)

    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  /*
    Deletions:
    - [x] group deleted -> should delete all group’s branches
    - [x] file in group deleted -> should delete all group’s branches
    - [x] dependency in file in group deleted -> should delete all group’s branches
    Additions:
    - [x] group added -> should return create-initial-group-branch job
    - [x] file in group added -> should delete all group’s branches, create-initial-group-branch job
    - [x] dependency in file in group added ->
    Modifications:
    - [x] group renamed -> delete all branches & new initial subgroup branch
    - [x] package.json renamed -> delete all branches & new initial subgroup branch
    - [x] package.json moved to another group -> delete all branches & new initial subgroup branch
  */

  test('monorepo: new greenkeeper.json is added with 2 groups (3462)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put(
      {
        _id: '3462',
        fullName: 'hans/monorepo',
        accountId: '321',
        enabled: true,
        headSha: 'hallo',
        packages: {
          'packages/frontend/package.json': {
            name: 'testpkg',
            dependencies: {
              lodash: '^0.9.0'
            }
          },
          'packages/backend/package.json': {
            name: 'testpkg',
            dependencies: {
              lodash: '^0.9.0'
            }
          }
        }
      }
    )

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['greenkeeper.json'],
          removed: [],
          modified: []
        }
      ],
      repository: {
        id: 3462,
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(2)
    expect(_.every(newJob, ['data.name', 'create-initial-subgroup-branch'])).toBeTruthy()

    const repo = await repositories.get('3462')

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: 2 package.jsons in 2 groups with existing branches (777)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        },
        'i_live_again': {
          packages: [
            'packages/lalalalala/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '777',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^0.9.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^0.9.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '777:branch:1234abcd',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-0.9.1'
        },
        {
          _id: '777:branch:1234abce',
          type: 'branch',
          sha: '1234abce',
          repositoryId: '777',
          version: '1.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-1.0.0'
        },
        {
          _id: '777:branch:1234abcf',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-0.9.1'
        },
        {
          _id: '777:branch:1234abcg',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/i_live_again/lodash-0.9.1'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-0.9.1')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-1.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-0.9.1')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/i_live_again/lodash-0.9.1')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/frontend/package.json', 'packages/backend/package.json']
        }
      ],
      repository: {
        id: 777,
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('777')

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    const oldFrontend = await repositories.get('777:branch:1234abcd')
    expect(oldFrontend.referenceDeleted).toBeTruthy()
    const currentFrontend = await repositories.get('777:branch:1234abce')
    expect(currentFrontend.referenceDeleted).toBeTruthy()
    const oldBackend = await repositories.get('777:branch:1234abcf')
    expect(oldBackend.referenceDeleted).toBeTruthy()
    const totallyIrrelevantBranch = await repositories.get('777:branch:1234abcg')
    expect(totallyIrrelevantBranch.referenceDeleted).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: dependency removed in 2 package.jsons in 2 groups with existing branches (777A)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        },
        'i_live_again': {
          packages: [
            'packages/lalalalala/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '777A',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/lalalalala/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '777A:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777A',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '777A:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777A',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        },
        {
          _id: '777A:branch:1234abcc',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '777A',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/i_live_again/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            underscore: '^10.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            underscore: '^10.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/i_live_again/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/frontend/package.json', 'packages/backend/package.json']
        }
      ],
      repository: {
        id: '777A',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('777A')

    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json', 'packages/lalalalala/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          underscore: '^10.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          underscore: '^10.0.0'
        }
      },
      'packages/lalalalala/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    const frontend = await repositories.get('777A:branch:1234abca')
    expect(frontend.referenceDeleted).toBeTruthy()
    const backend = await repositories.get('777A:branch:1234abcb')
    expect(backend.referenceDeleted).toBeTruthy()
    const totallyIrrelevantBranch = await repositories.get('777A:branch:1234abcc')
    expect(totallyIrrelevantBranch.referenceDeleted).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: file in group deleted with existing branches (888)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '888',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/lalalalala/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '888:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '888',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '888:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '888',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        },
        {
          _id: '888:branch:initialGroup',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '888',
          head: 'greenkeeper/initial-frontend',
          initial: false,
          subgroupInitial: true,
          group: 'frontend'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(404, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/initial-frontend')
      .reply(200, {})

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['packages/lalalalala/package.json'],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '888',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('888')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('888:branch:1234abca')
    expect(frontend.referenceDeleted).toBeTruthy()
    const backend = await repositories.get('888:branch:1234abcb')
    expect(backend.referenceDeleted).toBeFalsy()
    const subgroupInitial = await repositories.get('888:branch:initialGroup')
    expect(subgroupInitial.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: group deleted with existing branches (999)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '999',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/lalalalala/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '999:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '999',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '999:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '999',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(404, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['packages/backend/package.json'],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '999',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('999')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/lalalalala/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/lalalalala/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('999:branch:1234abca')
    expect(frontend.referenceDeleted).toBeFalsy()
    const backend = await repositories.get('999:branch:1234abcb')
    expect(backend.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: group added (1111)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await repositories.put(
      {
        _id: '1111',
        fullName: 'hans/monorepo',
        accountId: '321',
        enabled: true,
        headSha: 'hallo',
        packages: {
          'packages/frontend/package.json': {
            name: 'testpkg',
            dependencies: {
              lodash: '^1.0.0'
            }
          },
          'packages/lalalalala/package.json': {
            name: 'testpkg',
            dependencies: {
              lodash: '^1.0.0'
            }
          }
        },
        greenkeeper: configFileContent
      }
    )

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['packages/backend/package.json'],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '1111',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(1)
    const job = newJob[0].data
    expect(job.name).toEqual('create-initial-subgroup-branch')
    expect(job.accountId).toEqual('321')
    expect(job.repositoryId).toEqual('1111')

    const repo = await repositories.get('1111')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/lalalalala/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/lalalalala/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: file in group added with existing branches (1112)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1112',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1112:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1112',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '1112:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1112',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['packages/lalalalala/package.json'],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '1112',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(1)
    const job = newJob[0].data
    expect(job.name).toEqual('create-initial-subgroup-branch')
    expect(job.accountId).toEqual('321')
    expect(job.repositoryId).toEqual('1112')

    const repo = await repositories.get('1112')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/lalalalala/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/lalalalala/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('1112:branch:1234abca')
    expect(frontend.referenceDeleted).toBeTruthy()
    const backend = await repositories.get('1112:branch:1234abcb')
    expect(backend.referenceDeleted).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: dependency in file in group added with existing branches (1113)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1113',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1113:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1113',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '1113:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1113',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0',
            react: '1.0.1'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['packages/frontend/package.json']
        }
      ],
      repository: {
        id: '1113',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('1113')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0',
          react: '1.0.1'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    const frontend = await repositories.get('1113:branch:1234abca')
    expect(frontend.referenceDeleted).toBeFalsy()
    const backend = await repositories.get('1113:branch:1234abcb')
    expect(backend.referenceDeleted).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: group renamed with existing branches (1114)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        newCoolName: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1114',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1114:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1114',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '1114:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1114',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '1114',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(1)
    const job = newJob[0].data
    expect(job.name).toEqual('create-initial-subgroup-branch')
    expect(job.accountId).toEqual('321')
    expect(job.repositoryId).toEqual('1114')

    const repo = await repositories.get('1114')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('1114:branch:1234abca')
    expect(frontend.referenceDeleted).toBeFalsy()
    const backend = await repositories.get('1114:branch:1234abcb')
    expect(backend.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: package.json renamed with existing branches (1115)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/app/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1115',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/app/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1115:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1115',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '1115:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1115',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, () => {
        // should not delete this one
        expect(true).toBeFalsy()
        return {}
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '1115',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(1)
    const job = newJob[0].data
    expect(job.name).toEqual('create-initial-subgroup-branch')
    expect(job.accountId).toEqual('321')
    expect(job.repositoryId).toEqual('1115')

    const repo = await repositories.get('1115')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('1115:branch:1234abca')
    expect(frontend.referenceDeleted).toBeFalsy()
    const backend = await repositories.get('1115:branch:1234abcb')
    expect(backend.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: package.json moved to another group (1116)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/app/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/app/package.json'
          ]
        }
      }
    }

    const newConfigFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json',
            'packages/app/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1116',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'packages/frontend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/backend/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/app/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1116:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1116',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        },
        {
          _id: '1116:branch:1234abcb',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1116',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/backend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(newConfigFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/app/package.json')
      .reply(200, {
        path: 'packages/app/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/backend/package.json')
      .reply(200, {
        path: 'packages/backend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/backend/lodash-2.0.0')
      .reply(200, {})
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, {})

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: '1116',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    expect(newJob).toHaveLength(1)
    const job = newJob[0].data
    expect(job.name).toEqual('create-initial-subgroup-branch')
    expect(job.groupName).toEqual('backend')
    expect(job.accountId).toEqual('321')
    expect(job.repositoryId).toEqual('1116')

    const repo = await repositories.get('1116')
    const expectedFiles = {
      'package.json': [ 'packages/frontend/package.json', 'packages/backend/package.json', 'packages/app/package.json' ],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'packages/frontend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/app/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      },
      'packages/backend/package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(newConfigFileContent)
    const frontend = await repositories.get('1116:branch:1234abca')
    expect(frontend.referenceDeleted).toBeTruthy()
    const backend = await repositories.get('1116:branch:1234abcb')
    expect(backend.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: greenkeeper.json deleted with existing branches (1117)', async () => {
    const configFileContentLocal = {
      groups: {
        frontend: {
          packages: [
            'package.json',
            'packages/lalalalala/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1117',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            },
            'packages/lalalalala/package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContentLocal
        },
        {
          _id: '1117:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1117',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/frontend/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(404)
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/frontend/lodash-2.0.0')
      .reply(200, {})

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['greenkeeper.json'],
          modified: []
        }
      ],
      repository: {
        id: '1117',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('1117')
    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject({})
    const frontend = await repositories.get('1117:branch:1234abca')
    expect(frontend.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: greenkeeper.json deleted but it only had the root package.json in one group with existing branches (1118)', async () => {
    const configFileContent = {
      groups: {
        default: {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '1118',
          fullName: 'hans/monorepo',
          accountId: '321',
          enabled: true,
          headSha: 'hallo',
          packages: {
            'package.json': {
              name: 'testpkg',
              dependencies: {
                lodash: '^1.0.0'
              }
            }
          },
          greenkeeper: configFileContent
        },
        {
          _id: '1118:branch:1234abca',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '1118',
          version: '0.9.1',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'greenkeeper/default/lodash-2.0.0'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(404)
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/default/lodash-2.0.0')
      .reply(200)

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: ['greenkeeper.json'],
          modified: []
        }
      ],
      repository: {
        id: '1118',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeFalsy()

    const repo = await repositories.get('1118')
    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject({})
    const frontend = await repositories.get('1118:branch:1234abca')
    expect(frontend.referenceDeleted).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  /*
    test greenkeeper.json validation handling
    invalid greenkeeper.json ADDED:
      - [x] invalid groupName
      - [x] invalid package-path
      - [x] invalid groupname and package-path
  */
  test('monorepo: invalid groupname added to greenkeeper.json by user (mga1)', async () => {
    const configFileContent = {
      groups: {
        '#invalid#groupname#': {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mga1',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      }
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg(configFileContent)
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['greenkeeper.json'],
          removed: [],
          modified: []
        }
      ],
      repository: {
        id: 'mga1',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters, underscores and dashes (a-zA-Z_-).')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mga1')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper.groups).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: invalid package-path greenkeeper.json added by user (mga2)', async () => {
    const configFileContent = {
      groups: {
        'valid_groupname': {
          packages: [
            '/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mga2',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      }
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg(configFileContent)
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['greenkeeper.json'],
          removed: [],
          modified: []
        }
      ],
      repository: {
        id: 'mga2',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The package path `/package.json` in the group `valid_groupname` must be relative and not start with a slash.')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mga2')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper.groups).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  /*
    Joi only returns one message here, because the errors are nested
  */
  test('monorepo: invalid groupName & package-path greenkeeper.json added by user (mga3)', async () => {
    const configFileContent = {
      groups: {
        '#invalid#groupname#': {
          packages: [
            '/package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mga3',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      }
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg(configFileContent)
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: ['greenkeeper.json'],
          removed: [],
          modified: []
        }
      ],
      repository: {
        id: 'mga3',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters, underscores and dashes (a-zA-Z_-).')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mga3')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper.groups).toBeFalsy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  /*
    test greenkeeper.json validation handling
    invalid greenkeeper.json MODIFIED:
      - [x] invalid groupName
      - [x] invalid package-path
      - [x] invalid groupname and package-path
  */
  test('monorepo: greenkeeper.json modified by user and it now has invalid groupname (mgm1)', async () => {
    const configFileContent = {
      groups: {
        'valid_groupname': {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mgm1',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg({
          groups: {
            '#invalid#groupname#': {
              packages: [
                'package.json'
              ]
            }
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'mgm1',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters, underscores and dashes (a-zA-Z_-).')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mgm1')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: greenkeeper.json modified by user and it now has invalid package-path (mgm2)', async () => {
    const configFileContent = {
      groups: {
        'valid_groupname': {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mgm2',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg({
          groups: {
            'valid_groupname': {
              packages: [
                '/package.json'
              ]
            }
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'mgm2',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The package path `/package.json` in the group `valid_groupname` must be relative and not start with a slash.')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mgm2')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  /*
    Joi only returns one message here, because the errors are nested
  */
  test('monorepo: greenkeeper.json modified by user and it now has invalid groupname & package-path (mgm3)', async () => {
    const configFileContent = {
      groups: {
        'valid_groupname': {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mgm3',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg({
          groups: {
            '#invalid#groupname#': {
              packages: [
                '/package.json'
              ]
            }
          }
        })
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'mgm3',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters, underscores and dashes (a-zA-Z_-).')

    const expectedFiles = {
      'package.json': ['package.json'],
      'package-lock.json': [],
      'yarn.lock': [],
      'npm-shrinkwrap.json': []
    }
    const expectedPackages = {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    }

    const repo = await repositories.get('mgm3')
    expect(repo.files).toMatchObject(expectedFiles)
    expect(repo.packages).toMatchObject(expectedPackages)
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: greenkeeper.json broken by user on a disabled repo receives validation issue (mgm4)', async () => {
    const configFileContent = {
      groups: {
        'valid_groupname': {
          packages: [
            'package.json'
          ]
        }
      }
    }

    // Invalid JSON for the `greenkeeper.json` on GitHub, missing colon after `groups`
    // JSON.parse will throw `Unexpected token g in JSON at position 8`
    const invalidJSONString = `{
      groups {
        '#invalid#groupname#': {
          packages: [
            '/package.json'
          ]
        }
      }
    }`

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mgm4',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: false,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(invalidJSONString).toString('base64')
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'mgm4',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('invalid-config-file')
    expect(job.messages[0]).toEqual('Could not parse `greenkeeper.json`, it appears to not be a valid JSON file.')

    const repo = await repositories.get('mgm4')
    expect(repo.greenkeeper).toMatchObject(configFileContent)
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab3b')
  })

  test('monorepo: invalid greenkeeper.json fixed by user, starts create-initial-branch (mgm5)', async () => {
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'package.json'
          ]
        }
      }
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mgm5',
      fullName: 'hans/monorepo',
      accountId: '321',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent,
      openInitialPRWhenConfigFileFixed: true
    })

    // This is the invalid config file-issue
    await repositories.put({
      _id: 'mgm5:issue:12',
      _rev: '1-a33c3fda82f864c0a9b8ddc351f25048',
      type: 'issue',
      initial: false,
      invalidConfig: true,
      repositoryId: 'mgm5',
      number: 12,
      state: 'open',
      createdAt: '2018-04-13T10:12:10.591Z',
      updatedAt: '2018-04-13T10:12:10.591Z'
    })

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: encodePkg(configFileContent)
      })

    const newJob = await githubPush({
      installation: {
        id: 11
      },
      ref: 'refs/heads/master',
      after: '9049f1265b7d61be4a8904a9a27120d2064dab3b',
      head_commit: {},
      commits: [
        {
          added: [],
          removed: [],
          modified: ['greenkeeper.json']
        }
      ],
      repository: {
        id: 'mgm5',
        full_name: 'hans/monorepo',
        name: 'test',
        owner: {
          login: 'hans'
        },
        default_branch: 'master'
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job).toEqual({
      name: 'create-initial-branch',
      repositoryId: 'mgm5',
      accountId: '321',
      closes: [12]
    })
    const repo = await repositories.get('mgm5')
    expect(repo.openInitialPRWhenConfigFileFixed).toBeFalsy()
    expect(repo.greenkeeper).toMatchObject(configFileContent)
  })
})

function encodePkg (pkg) {
  return Buffer.from(JSON.stringify(pkg)).toString('base64')
}
