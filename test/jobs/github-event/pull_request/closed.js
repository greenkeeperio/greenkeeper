const { test, tearDown } = require('tap')
const nock = require('nock')
const dbs = require('../../../../lib/dbs')
const { cleanCache, requireFresh } = require('../../../helpers/module-cache-helpers')
const removeIfExists = require('../../../helpers/remove-if-exists')
// requireFresh uses a path relative to THEIR path, that's why we use the resolved
// path here, making it a bit clearer which file we're actually requiring
const pathToWorker = require.resolve('../../../../jobs/github-event/pull_request/closed')

test('github-event pull_request closed', async t => {
  t.beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    return Promise.resolve()
  })

  const { repositories, payments } = await dbs()
  await Promise.all([
    repositories.put({
      _id: '42',
      enabled: false,
      repositoryId: '42'
    }),
    repositories.put({
      _id: '42:pr:666',
      initial: true,
      head: 'thehead',
      repositoryId: '42'
    }),
    repositories.put({
      _id: '43',
      accountId: '1',
      enabled: false,
      private: true,
      repositoryId: '43'
    }),
    repositories.put({
      _id: '43:pr:777',
      initial: true,
      head: 'thehead',
      repositoryId: '43'
    }),
    repositories.put({
      _id: '44',
      accountId: '1',
      enabled: false,
      private: true,
      repositoryId: '44'
    }),
    repositories.put({
      _id: '44:pr:888',
      initial: true,
      head: 'thehead',
      repositoryId: '44'
    }),
    payments.put({
      _id: '1',
      plan: 'personal',
      stripeSubscriptionId: 'si123'
    })
  ])

  t.test('initial pr merged', async t => {
    const worker = requireFresh(pathToWorker)

    t.plan(6)
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200, () => {
        t.pass('deleted reference')
      })

    const newJob = await worker({
      installation: {
        id: 37
      },
      pull_request: {
        id: 666,
        merged: true,
        state: 'closed'
      },
      repository: {
        full_name: 'finnp/test',
        id: 42,
        owner: {
          id: 10
        }
      }
    })

    t.notOk(newJob, 'no new job')
    const pr = await repositories.get('42:pr:666')
    t.is(pr.state, 'closed', 'pr status is closed')
    t.is(pr.merged, true, 'pr is merged')
    t.ok(pr.updatedAt, 'updatedAt is updated')
    const repository = await repositories.get('42')
    t.ok(repository.enabled, 'repository is enabled')
    t.end()
  })

  t.test('initial pr merged on private repo with payment plan', async t => {
    const worker = requireFresh(pathToWorker)

    t.plan(2)
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200, {})

    const newJob = await worker({
      installation: {
        id: 37
      },
      pull_request: {
        id: 777,
        merged: true,
        state: 'closed'
      },
      repository: {
        full_name: 'finnp/test',
        id: 43,
        accountId: 1,
        owner: {
          id: 10
        }
      }
    })

    t.ok(newJob, 'new job')
    t.equal(newJob.data.name, 'update-payments')
    t.end()
  })

  t.test('initial pr merged on private repo with payment plan on GKE', async t => {
    process.env.IS_ENTERPRISE = true
    const worker = requireFresh(pathToWorker)

    t.plan(1)
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200, {})

    const newJob = await worker({
      installation: {
        id: 37
      },
      pull_request: {
        id: 888,
        merged: true,
        state: 'closed'
      },
      repository: {
        full_name: 'finnp/test',
        id: 44,
        accountId: 1,
        owner: {
          id: 10
        }
      }
    })

    t.notOk(newJob, 'no new job')
    t.end()
  })
})

tearDown(async () => {
  const { repositories, payments } = await dbs()
  await Promise.all([
    removeIfExists(repositories, '42:pr:666'),
    removeIfExists(repositories, '43:pr:777'),
    removeIfExists(repositories, '44:pr:888'),
    removeIfExists(repositories, '42'),
    removeIfExists(repositories, '43'),
    removeIfExists(repositories, '44'),
    removeIfExists(payments, '1')
  ])
})
