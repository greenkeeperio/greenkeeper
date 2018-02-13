const nock = require('nock')

const dbs = require('../../../lib/dbs')
const removeIfExists = require('../../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('github-event status', async () => {
  beforeAll(async() => {
    const { installations } = await dbs()

    await installations.put({
      _id: '10',
      installation: '1337'
    })
  })

  beforeEach(() => {
    jest.resetModules()
  })

  test('initial pr', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)
    const worker = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/deadbeef/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })

    await repositories.put({
      _id: '42:branch:deadbeef',
      type: 'branch',
      initial: true,
      sha: 'deadbeef'
    })

    const newJob = await worker({
      state: 'success',
      sha: 'deadbeef',
      installation: { id: 1336 },
      repository: {
        id: 42,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-pr')
    expect(job.branchDoc.sha).toEqual('deadbeef')
    expect(job.combined.state).toEqual('success')
    expect(job.repository.id).toBe(42)
    expect(job.installationId).toEqual(1336)
  })

  test('initial pr by user', async () => {
    const { repositories } = await dbs()
    expect.assertions(8)

    const worker = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/deadbeef/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })

    await repositories.put({
      _id: '44:branch:deadbeef',
      type: 'branch',
      initial: true,
      sha: 'deadbeef'
    })

    await repositories.put({
      _id: '44:pr:1234',
      type: 'pr',
      initial: true,
      number: 1234,
      createdByUser: true
    })

    const newJob = await worker({
      state: 'success',
      sha: 'deadbeef',
      installation: { id: 1336 },
      repository: {
        id: 44,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-pr-comment')
    expect(job.branchDoc.sha).toEqual('deadbeef')
    expect(job.combined.state).toEqual('success')
    expect(job.prDocId).toEqual('44:pr:1234')
    expect(job.accountId).toEqual('10')
    expect(job.repository.id).toBe(44)
    expect(job.installationId).toEqual(1336)
  })

  test('version branch', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)

    const githubStatus = require('../../../jobs/github-event/status')
    jest.mock('../../../lib/handle-branch-status', () => (args) => {
      expect(args.installationId).toBe(1337)
      expect(args.repository.id).toBe(43)
      expect(args.branchDoc.dependency).toEqual('test')
      expect(args.accountId).toEqual('10')
      expect(args.combined.state).toEqual('success')
    })

    nock('https://api.github.com')
      .post('/installations/1337/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/deadbeef2/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })

    await repositories.put({
      _id: '43:branch:deadbeef',
      type: 'branch',
      sha: 'deadbeef2',
      head: 'branchname',
      dependency: 'test',
      version: '1.0.1'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'deadbeef2',
      installation: { id: 1337 },
      repository: {
        id: 43,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })
    expect(newJob).toBeFalsy()
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, '10'),
      removeIfExists(repositories, '42:branch:deadbeef', '43:branch:deadbeef', '44:branch:deadbeef', '44:pr:1234')
    ])
  })
})
