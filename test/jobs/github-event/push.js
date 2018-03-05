const nock = require('nock')

const dbs = require('../../../lib/dbs')
const removeIfExists = require('../../helpers/remove-if-exists')
const { cleanCache, requireFresh } = require('../../helpers/module-cache-helpers')
// requireFresh uses a path relative to THEIR path, that's why we use the resolved
// path here, making it a bit clearer which file we're actually requiring
const pathToWorker = require.resolve('../../../jobs/github-event/push')

describe('github-event push', async () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    nock.cleanAll()
  })

  beforeAll(async() => {
    const { payments } = await dbs()

    await payments.put({
      _id: '123',
      plan: 'personal',
      stripeSubscriptionId: 'si123'
    })
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
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

  test('subdirectory package.json was modified (555)', async () => {
    const { repositories } = await dbs()

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
    const configFileContent = {
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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
    console.log('repoDoc', repo)
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

  test('subdirectory package.json, which is not listed in the config, was modified (555)', async () => {
    const { repositories } = await dbs()
    const githubPush = requireFresh(pathToWorker)
    const configFileContent = {
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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
    TODO:
    Deletions:
    - [ ] group deleted -> should delete all group’s branches
    - [ ] file in group deleted -> should delete all group’s branches
    - [ ] dependency in file in group deleted -> should delete all group’s branches
    Additions:
    - [ ] group added -> should return create-initial-group-branch job
    - [ ] file in group added -> should delete all group’s branches, create-initial-group-branch job
    - [ ] dependency in file in group added -> nothing should happen except package.json update
    Modifications ?
  */
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
        'i-live-again': {
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
          head: 'greenkeeper/i-live-again/lodash-0.9.1'
        }
      ])
    ])

    const githubPush = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/i-live-again/lodash-0.9.1')
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
    console.log('repoDoc', repo)

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

  afterAll(async () => {
    const { repositories, payments } = await dbs()

    await removeIfExists(repositories, '444', '444A', '445', '445A', '446', '447', '448', '444:branch:1234abcd', '444:branch:1234abce', '444A:branch:1234abcd', '444A:branch:1234abce', '555', '666', '777', '777:branch:1234abcd', '777:branch:1234abce', '777:branch:1234abcf', '777:branch:1234abcg')
    await removeIfExists(payments, '123')
  })
})

function encodePkg (pkg) {
  return Buffer.from(JSON.stringify(pkg)).toString('base64')
}
