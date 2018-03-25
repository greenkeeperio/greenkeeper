const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('handle-branch-status', async () => {
  afterAll(async () => {
    const { repositories, installations, npm } = await dbs()
    await Promise.all([
      removeIfExists(repositories, '42:branch:deadbeef', '42:branch:deadbeef2', '43:branch:deadbeef3', '43:issue:5'),
      removeIfExists(installations, '10'),
      removeIfExists(npm, 'test', 'test2')
    ])
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(async() => {
    const { repositories, installations, npm } = await dbs()
    await Promise.all([
      installations.put({
        _id: '10',
        installation: '1337'
      }),
      npm.put({
        _id: 'test',
        versions: {}
      }),
      npm.put({
        _id: 'test2',
        versions: {}
      }),
      repositories.put({
        _id: '42:branch:deadbeef',
        type: 'branch',
        sha: 'deadbeef',
        head: 'branchname',
        dependency: 'test',
        version: '1.0.1'
      }),
      repositories.put({
        _id: '42:branch:deadbeef2',
        type: 'branch',
        sha: 'deadbeef2',
        head: 'branchname2',
        dependency: 'test2',
        version: '1.0.2'
      })
    ])
  })

  test('success', async () => {
    jest.mock('../../lib/open-issue', data => data => {
      // open an issue
      expect(true).toBeTruthy()
    })
    const handleBranchStatus = require('../../lib/handle-branch-status')

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/club/mate/git/refs/heads/branchname')
      .reply(422, () => {
        // simulate reference already been deleted
        expect(true).toBeTruthy()
        return {
          message: 'Reference does not exist'
        }
      })

    const { repositories } = await dbs()

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: '10',
      repository: {
        id: '42',
        full_name: 'club/mate'
      },
      branchDoc: await repositories.get('42:branch:deadbeef'),
      combined: {
        state: 'success',
        combined: []
      }
    })

    expect(newJob).toBeFalsy()
    const branch = await repositories.get('42:branch:deadbeef')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeTruthy()
    expect(branch.state).toEqual('success')
  })

  test('failure', async () => {
    const { repositories } = await dbs()

    expect.assertions(4)
    jest.mock('../../lib/open-issue', data => data => {
      // open an issue
      expect(true).toBeTruthy()
    })
    const handleBranchStatus = require('../../lib/handle-branch-status')

    nock('https://api.github.com')

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'failure', statuses: [] },
      branchDoc: await repositories.get('42:branch:deadbeef2'),
      repository: {
        id: 42,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeFalsy()
    const branch = await repositories.get('42:branch:deadbeef2')
    expect(branch.processed).toBeTruthy()
    expect(branch.state).toEqual('failure')
  })

  test('with issue', async () => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    const { repositories, npm } = await dbs()

    expect.assertions(5)
    await Promise.all([
      repositories.put({
        _id: '43:issue:5',
        type: 'issue',
        state: 'open',
        dependency: 'test3',
        repositoryId: '43',
        number: 5
      }),
      npm.put({
        _id: 'test3',
        versions: {}
      }),
      repositories.put({
        _id: '43:branch:deadbeef3',
        type: 'branch',
        sha: 'deadbeef3',
        head: 'branchname3',
        dependency: 'test3',
        version: '1.0.1'
      })
    ])

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/club/mate/issues/5/comments')
      .reply(201, () => {
        // commented on right issue
        expect(true).toBeTruthy()
      })

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'success', statuses: [] },
      branchDoc: await repositories.get('43:branch:deadbeef3'),
      repository: {
        id: 43,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('43:branch:deadbeef3')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeFalsy()
    expect(branch.state).toEqual('success')
  })
})
