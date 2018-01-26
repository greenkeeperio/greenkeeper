const { test, tearDown } = require('tap')
const nock = require('nock')
const dbs = require('../../../../lib/dbs')
const pathToWorker = require.resolve('../../../../jobs/github-event/pull_request/opened')
const { cleanCache, requireFresh } = require('../../../helpers/module-cache-helpers')
const removeIfExists = require('../../../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

const pullRequestPayLoad = ({prId, branchName, user, repositoryId}) => {
  return {
    installation: {
      id: 37
    },
    pull_request: {
      id: prId,
      merged: false,
      state: 'open',
      head: {
        ref: branchName
      },
      user
    },
    repository: {
      full_name: 'finnp/test',
      id: repositoryId,
      owner: {
        id: 10
      }
    }
  }
}

test('github-event pull_request opened', async t => {
  t.beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    return Promise.resolve()
  })

  const { repositories } = await dbs()
  await repositories.put({
    _id: '42',
    enabled: false,
    repositoryId: '42'
  })
  await repositories.put({
    _id: '43',
    enabled: false,
    repositoryId: '43',
    private: true
  })

  t.test('initial pr opened by user', async t => {
    const worker = requireFresh(pathToWorker)
 
    const newJob = await worker(
      pullRequestPayLoad({
        prId: 666,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 42
      })
    )

    t.notOk(newJob, 'no new job')
    const pr = await repositories.get('42:pr:666')
    t.is(pr.state, 'open', 'pr status is opened')
    t.is(pr.merged, false, 'pr is not merged')
    t.is(pr.initial, true, 'is initial pr')
    t.ok(pr.createdAt, 'createdAt is set')
    t.is(pr.createdByUser, true, 'pr is created by the user')
    t.end()
  })

  t.test('initial pr on private repo opened', async t => {
    const worker = requireFresh(pathToWorker)
    
    t.plan(2)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/finnp/test/statuses/')
      .reply(201, () => {
        t.pass('payment required status added')
        return {}
      })

    const newJob = await worker(
      pullRequestPayLoad({
        prId: 669,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 43
      })
    )

    t.notOk(newJob, 'no new job')
    t.end()
  })

  t.test('initial pr on private repo opened within GKE', async t => {
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
      .post('/repos/finnp/test/statuses/')
      .optionally()
      .reply(201, () => {
        t.fail('should not add payment required status')
        return {}
      })

    const newJob = await worker(
      pullRequestPayLoad({
        prId: 670,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 43
      })
    )

    t.notOk(newJob, 'no new job')
    t.end()
  })

  t.test('initial pr opened by greenkeeper', async t => {
    const worker = requireFresh(pathToWorker)

    const newJob = await worker(
      pullRequestPayLoad({
        prId: 667,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'Bot',
          login: 'greenkeeper[bot]'
        },
        repositoryId: 42
      })
    )

    t.notOk(newJob, 'no new job')
    try {
      await repositories.get('42:pr:667')
      t.fail('unexpected prdoc in database')
    } catch (e) {
      t.equals(e.status, 404, 'prdoc was not created')
    }
    t.end()
  })

  t.test('pr opened but is not our initial branch', async t => {
    const worker = requireFresh(pathToWorker)

    const newJob = await worker(
      pullRequestPayLoad({
        prId: 668,
        branchName: 'some-random-branch',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 42
      })
    )

    t.notOk(newJob, 'no new job')
    try {
      await repositories.get('42:pr:668')
      t.fail('unexpected prdoc in database')
    } catch (e) {
      t.equals(e.status, 404, 'prdoc was not created')
    }
    t.end()
  })
})

tearDown(async () => {
  const { repositories } = await dbs()
  await removeIfExists(repositories, '42')
  await removeIfExists(repositories, '43')
  const prDocIds = [666, 667, 668, 669, 670]

  prDocIds.forEach(async (docId) => {
    return Promise.all([
      removeIfExists(repositories, `42:pr:${docId}`),
      removeIfExists(repositories, `43:pr:${docId}`)
    ])
  })
})
