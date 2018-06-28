const nock = require('nock')

const dbs = require('../../../lib/dbs')
const removeIfExists = require('../../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('github-event status', async () => {
  beforeAll(async () => {
    const { installations } = await dbs()

    await installations.put({
      _id: '10',
      installation: '1337'
    })
  })

  beforeEach(() => {
    jest.resetModules()
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, '10'),
      removeIfExists(repositories, '42:branch:deadbeef', '42:branch:muppets', '42:branch:hats', '43:branch:deadbeef', '44:branch:deadbeef', '44:pr:1234', 'subgroup1:branch:abcdf1234', 'subgroup2:branch:plantsarethebest11', 'subgroup2:pr:1234')
    ])
  })

  test('initial pr', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)
    const githubStatus = require('../../../jobs/github-event/status')

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
      .get('/repos/club/mate/commits/deadbeef/check-runs')
      .reply(200, {
        'total_count': 0,
        'check_runs': []
      })

    await repositories.put({
      _id: '42:branch:deadbeef',
      type: 'branch',
      initial: true,
      sha: 'deadbeef'
    })

    const newJob = await githubStatus({
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

  test('initial pr with checks', async () => {
    const { repositories } = await dbs()
    expect.assertions(7)
    const githubStatus = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/muppets/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })
      .get('/repos/club/mate/commits/muppets/check-runs')
      .reply(200, {
        'total_count': 2,
        'check_runs': [
          {
            'id': 5599907,
            'head_sha': '9e6e440a0e6413b4c17eacd7f8bcd81343cc200a',
            'status': 'completed',
            'conclusion': 'success',
            'output': {
              'title': 'Build Passed',
              'summary': '<a href="https://travis-ci.com/club/mate/builds/77480025"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**.'
            },
            'name': 'Travis CI - Branch'
          },
          {
            'id': 5473198,
            'head_sha': '9e6e440a0e6413b4c17eacd7f8bcd81343cc200a',
            'status': 'completed',
            'conclusion': 'success',
            'output': {
              'summary': '<a href="https://travis-ci.com/club/mate/builds/77480041"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**, just like the previous build.'
            },
            'name': 'Travis CI - Pull Request'
          }
        ]
      })

    await repositories.put({
      _id: '42:branch:muppets',
      type: 'branch',
      initial: true,
      sha: 'muppets'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'muppets',
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
    expect(job.branchDoc.sha).toEqual('muppets')
    expect(job.combined.state).toEqual('success')
    expect(job.repository.id).toBe(42)
    expect(job.installationId).toEqual(1336)
    expect(job.combined.statuses).toHaveLength(2)
  })

  test('initial pr fails with a failed check', async () => {
    const { repositories } = await dbs()
    expect.assertions(7)
    const githubStatus = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/hats/status')
      .reply(200, {
        state: 'success',
        statuses: [{'state': 'success'}, {'state': 'success',}]
      })
      .get('/repos/club/mate/commits/hats/check-runs')
      .reply(200, {
        'total_count': 2,
        'check_runs': [
          {
            'id': 5599907,
            'head_sha': '9e6e440a0e6413b4c17eacd7f8bcd81343cc200a',
            'status': 'completed',
            'conclusion': 'success',
            'output': {
              'title': 'Build Passed',
              'summary': '<a href="https://travis-ci.com/club/mate/builds/77480025"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**.'
            },
            'name': 'Travis CI - Branch'
          },
          {
            'id': 5473198,
            'head_sha': '9e6e440a0e6413b4c17eacd7f8bcd81343cc200a',
            'status': 'completed',
            'conclusion': 'failure',
            'output': {
              'summary': '<a href="https://travis-ci.com/club/mate/builds/77480041"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**, just like the previous build.'
            },
            'name': 'Travis CI - Pull Request'
          }
        ]
      })

    await repositories.put({
      _id: '42:branch:hats',
      type: 'branch',
      initial: true,
      sha: 'hats'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'hats',
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
    expect(job.branchDoc.sha).toEqual('hats')
    expect(job.combined.state).toEqual('failure')
    expect(job.repository.id).toBe(42)
    expect(job.installationId).toEqual(1336)
    expect(job.combined.statuses).toHaveLength(4)
  })
  test('initial pr by user', async () => {
    const { repositories } = await dbs()
    expect.assertions(8)

    const githubStatus = require('../../../jobs/github-event/status')

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
      .get('/repos/club/mate/commits/deadbeef/check-runs')
      .reply(200, {
        'total_count': 0,
        'check_runs': []
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

    const newJob = await githubStatus({
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

  test('initial subgroup pr', async () => {
    const { repositories } = await dbs()
    expect.assertions(7)
    const githubStatus = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/lara/monorepo/commits/abcdf1234/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })
      .get('/repos/lara/monorepo/commits/abcdf1234/check-runs')
      .reply(200, {
        'total_count': 0,
        'check_runs': []
      })

    await repositories.put({
      _id: 'subgroup1:branch:abcdf1234',
      type: 'branch',
      initial: false,
      subgroupInitial: true,
      base: 'master',
      head: 'greenkeeper/initial-frontend',
      processed: false,
      depsUpdated: true,
      sha: 'abcdf1234'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'abcdf1234',
      installation: { id: 1336 },
      repository: {
        id: 'subgroup1',
        full_name: 'lara/monorepo',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-subgroup-pr')
    expect(job.branchDoc.sha).toEqual('abcdf1234')
    expect(job.combined.state).toEqual('success')
    expect(job.repository.id).toBe('subgroup1')
    expect(job.installationId).toEqual(1336)
    expect(job.groupName).toEqual('frontend')
  })

  test('initial subgroup pr by user', async () => {
    const { repositories } = await dbs()
    expect.assertions(9)

    const githubStatus = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/plant/monorepo/commits/plantsarethebest11/status')
      .reply(200, {
        state: 'success',
        statuses: []
      })
      .get('/repos/plant/monorepo/commits/plantsarethebest11/check-runs')
      .reply(200, {
        'total_count': 0,
        'check_runs': []
      })

    await repositories.put({
      _id: 'subgroup2:branch:plantsarethebest11',
      type: 'branch',
      initial: false,
      subgroupInitial: true,
      head: 'greenkeeper/initial-frontend',
      processed: false,
      depsUpdated: true,
      sha: 'plantsarethebest11'
    })

    await repositories.put({
      _id: 'subgroup2:pr:1234',
      type: 'pr',
      initial: false,
      subgroupInitial: true,
      number: 1234,
      createdByUser: true
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'plantsarethebest11',
      installation: { id: 1336 },
      repository: {
        id: 'subgroup2',
        full_name: 'plant/monorepo',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-subgroup-pr-comment')
    expect(job.branchDoc.sha).toEqual('plantsarethebest11')
    expect(job.combined.state).toEqual('success')
    expect(job.prDocId).toEqual('subgroup2:pr:1234')
    expect(job.accountId).toEqual('10')
    expect(job.repository.id).toBe('subgroup2')
    expect(job.installationId).toEqual(1336)
    expect(job.groupName).toEqual('frontend')
  })

  test('version branch', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)

    jest.mock('../../../lib/handle-branch-status', () => (args) => {
      expect(args.installationId).toBe(1337)
      expect(args.repository.id).toBe(43)
      expect(args.branchDoc.dependency).toEqual('test')
      expect(args.accountId).toEqual('10')
      expect(args.combined.state).toEqual('success')
    })
    const githubStatus = require('../../../jobs/github-event/status')

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
      .get('/repos/club/mate/commits/deadbeef2/check-runs')
      .reply(200, {
        'total_count': 0,
        'check_runs': []
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
})
