const _ = require('lodash')
const { test, tearDown } = require('tap')
const nock = require('nock')

const dbs = require('../../../lib/dbs')
const removeIfExists = require('../../helpers/remove-if-exists')
const worker = require('../../../jobs/github-event/push')

test('github-event push', async t => {
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

  t.test('package.json present', async t => {
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

    const newJobs = await worker({
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

    t.ok(newJobs, 'new job scheduled')
    t.is(newJobs.data.name, 'create-initial-branch', 'create-initial-branch')
    t.is(newJobs.data.repositoryId, '444', 'repositoryId')
    t.is(newJobs.data.accountId, '123', 'repositoryId')

    const repo = await repositories.get('444')
    t.ok(repo.files['package.json'])
    t.ok(repo.files['package-lock.json'])
    t.notOk(repo.files['npm-shrinkwrap.json'])
    t.same(repo.packages, {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^1.0.0'
        }
      }
    })
    t.is(repo.headSha, '9049f1265b7d61be4a8904a9a27120d2064dab3b')
    t.end()
  })

  t.test('do branch cleanup on modify', async t => {
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

    const newJobs = await worker({
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

    t.notOk(newJobs)

    const repo = await repositories.get('444')
    t.same(repo.packages, {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          lodash: '^2.0.0'
        }
      }
    })

    const branch = await repositories.get('444:branch:1234abcd')
    t.ok(branch.referenceDeleted)
    t.is(repo.headSha, '9049f1265b7d61be4a8904a9a27120d2064dab2b')
    t.end()
  })

  t.test('do branch cleanup on remove', async t => {
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

    const newJobs = await worker({
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

    t.notOk(newJobs)

    const repo = await repositories.get('444')
    t.same(repo.packages, {
      'package.json': {
        name: 'testpkg',
        dependencies: {
          underscore: '*'
        }
      }
    })

    const branch = await repositories.get('444:branch:1234abce')
    t.ok(branch.referenceDeleted)
    t.is(repo.headSha, '9049f1265b7d61be4a8904a9a27120d2064dab1b')
    t.end()
  })

  t.test('invalid package.json present', async t => {
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

    const newJobs = await worker({
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

    t.notOk(newJobs)

    const repo = await repositories.get('446')
    t.notOk(repo.enabled)
    t.is(repo.headSha, '9049f1265b7d61be4a8904a9a27120d2064dab3c')
    t.end()
  })

  t.test('no relevant changes', async t => {
    nock('https://api.github.com')
      .post('/installations/41/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(200, () => {
        t.fail('should not request package.json')
      })
    const newJobs = await worker({
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
    t.notOk(newJobs)
    t.end()
  })

  t.test('package.json deleted', async t => {
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finn/test/contents/package.json')
      .reply(404, {})

    const newJobs = await worker({
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

    t.notOk(newJobs)
    const repo = await repositories.get('445')
    t.notOk(_.get(repo.packages, ['package.json']))
    t.is(repo.headSha, 'deadbeef')
    t.notOk(repo.enabled)
    t.end()
  })

  t.test('package.json deleted on private repo', async t => {
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finn/private/contents/package.json')
      .reply(404, {})

    const newJobs = await worker({
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

    t.equal(newJobs.data.name, 'update-payments')
    const repo = await repositories.get('447')
    t.notOk(_.get(repo.packages, ['package.json']))
    t.is(repo.headSha, 'deadbeef')
    t.notOk(repo.enabled)
    t.end()
  })
})

tearDown(async () => {
  const { repositories, payments } = await dbs()

  await removeIfExists(repositories, '444')
  await removeIfExists(repositories, '445')
  await removeIfExists(repositories, '446')
  await removeIfExists(repositories, '447')
  await removeIfExists(repositories, '444:branch:1234abcd')
  await removeIfExists(repositories, '444:branch:1234abce')
  await removeIfExists(payments, '123')
})

function encodePkg (pkg) {
  return Buffer.from(JSON.stringify(pkg)).toString('base64')
}
