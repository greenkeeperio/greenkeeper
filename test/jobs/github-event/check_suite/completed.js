const nock = require('nock')

const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('github-event checksuite_completed', async () => {
  beforeAll(async () => {
    const { installations } = await dbs()

    await installations.put({
      _id: '1111',
      installation: '7331'
    })
  })

  beforeEach(() => {
    jest.resetModules()
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, '1111'),
      removeIfExists(repositories, '42:branch:deadbeef')
    ])
  })

  test('initial pr, no statuses', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)
    const githubStatus = require('../../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/app/installations/7331/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/deadbeef/status')
      .reply(200, {
        state: 'pending',
        statuses: []
      })
      .get('/repos/club/mate/commits/deadbeef/check-runs')
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
      _id: '42:branch:deadbeef',
      type: 'branch',
      initial: true,
      sha: 'deadbeef'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'deadbeef',
      installation: { id: 7331 },
      repository: {
        id: 42,
        full_name: 'club/mate',
        owner: {
          id: 1111
        }
      }
    })

    expect(newJob).toBeTruthy()
    const job = newJob.data
    expect(job.name).toEqual('create-initial-pr')
    expect(job.branchDoc.sha).toEqual('deadbeef')
    expect(job.combined.state).toEqual('success')
    expect(job.repository.id).toBe(42)
    expect(job.installationId).toEqual(7331)
  })

  test('no initial pr, no statuses, one check pending', async () => {
    const { repositories } = await dbs()
    expect.assertions(1)
    const githubStatus = require('../../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/app/installations/7331/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/catbus/status')
      .reply(200, {
        state: 'pending',
        statuses: []
      })
      .get('/repos/club/mate/commits/catbus/check-runs')
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
            'status': 'in_progress',
            'output': {
              'summary': '<a href="https://travis-ci.com/club/mate/builds/77480041"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**, just like the previous build.'
            },
            'name': 'Travis CI - Pull Request'
          }
        ]
      })

    await repositories.put({
      _id: '42:branch:catbus',
      type: 'branch',
      initial: true,
      sha: 'catbus'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'catbus',
      installation: { id: 7331 },
      repository: {
        id: 42,
        full_name: 'club/mate',
        owner: {
          id: 1111
        }
      }
    })

    expect(newJob).toBeFalsy()
  })
})
