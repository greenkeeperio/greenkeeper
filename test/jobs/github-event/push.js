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
  })

  beforeAll(async() => {
    const { repositories, payments } = await dbs()

    await Promise.all([
      repositories.bulkDocs([
        {
          _id: '444',
          fullName: 'finn/test',
          accountId: '123'
        },
        {
          _id: '445',
          fullName: 'finn/enabled',
          accountId: '123',
          enabled: true
        },
        {
          _id: '446',
          fullName: 'finn/enabled2',
          accountId: '123',
          enabled: true
        },
        {
          _id: '447',
          fullName: 'finn/private',
          accountId: '123',
          enabled: true,
          private: true
        },
        {
          _id: '448',
          fullName: 'finn/private',
          accountId: '123',
          enabled: true,
          private: true
        },
        {
          _id: '444:branch:1234abcd',
          type: 'branch',
          sha: '1234abcd',
          repositoryId: '444',
          version: '2.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'gk-lodash-2.0.0'
        },
        {
          _id: '444:branch:1234abce',
          type: 'branch',
          sha: '1234abce',
          repositoryId: '444',
          version: '3.0.0',
          dependency: 'lodash',
          dependencyType: 'dependencies',
          head: 'gk-lodash-3.0.0'
        }
      ])
    ])

    await payments.put({
      _id: '123',
      plan: 'personal',
      stripeSubscriptionId: 'si123'
    })
  })

  test('package.json present', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/finn/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        content: encodePkg({})
      })

    const newJob = await worker({
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
        id: 444,
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
    expect(job.repositoryId).toEqual('444')

    const repo = await repositories.get('444')
    const expectedFiles = {
      'npm-shrinkwrap.json': false,
      'package-lock.json': true,
      'package.json': true,
      'yarn.lock': false
    }
    expect(repo.files).toMatchObject(expectedFiles)

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

  test('do branch cleanup on modify', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

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
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^2.0.0'
          }
        })
      })
      .delete('/repos/finn/test/git/refs/heads/gk-lodash-2.0.0')
      .reply(200, {})

    const newJob = await worker({
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

  test('do branch cleanup on remove', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

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
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            underscore: '*'
          }
        })
      })
      .delete('/repos/finn/test/git/refs/heads/gk-lodash-3.0.0')
      .reply(200, {})

    const newJob = await worker({
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
          underscore: '*'
        }
      }
    }
    expect(repo.packages).toMatchObject(expectedPackages)

    const branch = await repositories.get('444:branch:1234abce')
    expect(branch.referenceDeleted).toBeTruthy()
    expect(repo.headSha).toEqual('9049f1265b7d61be4a8904a9a27120d2064dab1b')
  })

  test('invalid package.json present', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

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
        content: Buffer.from('test').toString('base64')
      })

    const newJob = await worker({
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

  test('no relevant changes', async () => {
    const worker = requireFresh(pathToWorker)
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
    const newJob = await worker({
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

  test('package.json deleted', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

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

    const newJob = await worker({
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

    const repo = await repositories.get('445')
    expect(repo).not.toHaveProperty('packages')
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })

  test('package.json deleted on private repo', async () => {
    const { repositories } = await dbs()
    const worker = requireFresh(pathToWorker)

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

    const newJob = await worker({
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
    expect(repo).not.toHaveProperty('packages')
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })

  test('package.json deleted on private repo within GKE', async () => {
    const { repositories } = await dbs()
    process.env.IS_ENTERPRISE = true
    const worker = requireFresh(pathToWorker)

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

    const newJob = await worker({
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
    expect(repo).not.toHaveProperty('packages')
    expect(repo.files).not.toHaveProperty('package.json')
    expect(repo.headSha).toEqual('deadbeef')
    expect(repo.enabled).toBeFalsy()
  })

  afterAll(async () => {
    const { repositories, payments } = await dbs()

    await removeIfExists(repositories, '444', '445', '446', '447', '448', '444:branch:1234abcd', '444:branch:1234abce')
    await removeIfExists(payments, '123')
  })
})

function encodePkg (pkg) {
  return Buffer.from(JSON.stringify(pkg)).toString('base64')
}
