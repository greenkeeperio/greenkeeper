const nock = require('nock')

const dbs = require('../../../../lib/dbs')
const { cleanCache, requireFresh } = require('../../../helpers/module-cache-helpers')
const removeIfExists = require('../../../helpers/remove-if-exists')
// requireFresh uses a path relative to THEIR path, that's why we use the resolved
// path here, making it a bit clearer which file we're actually requiring
const pathToWorker = require.resolve('../../../../jobs/github-event/pull_request/opened')

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
        ref: branchName,
        sha: 'deadsha'
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

describe('github-event pull_request opened', async () => {
  beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
  })

  beforeAll(async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '40',
      enabled: false,
      repositoryId: '40'
    })
    await repositories.put({
      _id: '41',
      enabled: false,
      repositoryId: '41',
      private: true
    })
  })

  afterAll(async () => {
    const { repositories } = await dbs()
    await Promise.all([
      removeIfExists(repositories, '40', '41'),
      removeIfExists(repositories, '40:pr:666', '40:pr:667', '40:pr:668', '40:pr:669', '40:pr:670'),
      removeIfExists(repositories, '41:pr:666', '41:pr:667', '41:pr:668', '41:pr:669', '41:pr:670')
    ])
  })

  test('initial pr opened by user', async () => {
    const { repositories } = await dbs()
    const prOpened = requireFresh(pathToWorker)

    const newJob = await prOpened(
      pullRequestPayLoad({
        prId: 666,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 40
      })
    )
    expect(newJob).toBeFalsy()

    const pr = await repositories.get('40:pr:666')

    expect(pr.state).toEqual('open')
    expect(pr.merged).toBeFalsy()
    expect(pr.createdAt).toBeTruthy()
    expect(pr.updatedAt).toBeFalsy()
    expect(pr.initial).toBeTruthy()
    expect(pr.createdByUser).toBeTruthy()
  })

  test('initial pr on private repo opened', async () => {
    const prOpened = requireFresh(pathToWorker)

    expect.assertions(2)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .post('/repos/finnp/test/statuses/deadsha')
      .reply(201, () => {
        // payment required status added
        expect(true).toBeTruthy()
        return {}
      })

    const newJob = await prOpened(
      pullRequestPayLoad({
        prId: 669,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 41
      })
    )
    expect(newJob).toBeFalsy()
  })

  test('initial pr on private repo opened within GKE', async () => {
    process.env.IS_ENTERPRISE = true
    const prOpened = requireFresh(pathToWorker)

    expect.assertions(1)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .post('/repos/finnp/test/statuses/deadsha')
      .reply(201, () => {
        // not add payment required status
        return {}
      })

    const newJob = await prOpened(
      pullRequestPayLoad({
        prId: 670,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 41
      })
    )
    expect(newJob).toBeFalsy()
  })

  test('initial pr opened by greenkeeper', async () => {
    const { repositories } = await dbs()
    const prOpened = requireFresh(pathToWorker)

    const newJob = await prOpened(
      pullRequestPayLoad({
        prId: 667,
        branchName: 'greenkeeper/initial',
        user: {
          type: 'Bot',
          login: 'greenkeeper[bot]'
        },
        repositoryId: 40
      })
    )
    expect(newJob).toBeFalsy()

    try {
      await repositories.get('40:pr:667')
    } catch (e) {
      // prdoc was not created
      expect(e.status).toBe(404)
    }
  })

  test('pr opened but is not our initial branch', async () => {
    const { repositories } = await dbs()
    const prOpened = requireFresh(pathToWorker)
    expect.assertions(2)

    const newJob = await prOpened(
      pullRequestPayLoad({
        prId: 668,
        branchName: 'some-random-branch',
        user: {
          type: 'User',
          login: 'finnp'
        },
        repositoryId: 40
      })
    )
    expect(newJob).toBeFalsy()

    try {
      await repositories.get('40:pr:668')
    } catch (e) {
      // prdoc was not created
      expect(e.status).toBe(404)
    }
  })
})
