const nock = require('nock')

const dbs = require('../../../../lib/dbs')
const { cleanCache, requireFresh } = require('../../../helpers/module-cache-helpers')
const removeIfExists = require('../../../helpers/remove-if-exists')
// requireFresh uses a path relative to THEIR path, that's why we use the resolved
// path here, making it a bit clearer which file we're actually requiring
const pathToWorker = require.resolve('../../../../jobs/github-event/pull_request/closed')

describe('github-event pull_request closed', async () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
  })

  beforeAll(async () => {
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
  })

  afterAll(async () => {
    const { repositories, payments } = await dbs()
    await Promise.all([
      removeIfExists(repositories, '42:pr:666', '43:pr:777', '44:pr:888', '42', '43', '44'),
      removeIfExists(payments, '1')
    ])
  })

  test('initial pr merged', async () => {
    const { repositories } = await dbs()

    const prClosed = requireFresh(pathToWorker)

    expect.assertions(6)
    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200, () => {
        // deleted reference
        expect(true).toBeTruthy()
      })

    const newJob = await prClosed({
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
    expect(newJob).toBeFalsy()

    githubMock.done()

    const pr = await repositories.get('42:pr:666')
    const repository = await repositories.get('42')

    expect(pr.state).toEqual('closed')
    expect(pr.merged).toBeTruthy()
    expect(pr.updatedAt).toBeTruthy()
    expect(repository.enabled).toBeTruthy()
  })

  test('initial pr merged on private repo with payment plan', async () => {
    const prClosed = requireFresh(pathToWorker)
    expect.assertions(2)

    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200)

    const newJob = await prClosed({
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
    githubMock.done()
    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('update-payments')
  })

  test('initial pr merged on private repo with payment plan on GKE', async () => {
    process.env.IS_ENTERPRISE = true
    const prClosed = requireFresh(pathToWorker)

    expect.assertions(1)
    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200)

    const newJob = await prClosed({
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
    githubMock.done()
    expect(newJob).toBeFalsy()
  })
})
