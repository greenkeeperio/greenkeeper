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
      removeIfExists(repositories, '42:branch:deadbeef'),
      removeIfExists(repositories, '42:branch:catbus'),
      removeIfExists(repositories, '42:branch:busdog'),
      removeIfExists(repositories, '42:branch:pelicanballoon'),
      removeIfExists(repositories, '42:branch:giraffeplane')
    ])
  })

  test('initial pr, no statuses', async () => {
    const { repositories } = await dbs()
    expect.assertions(6)
    const checkrunCompleted = require('../../../../jobs/github-event/check_run/completed')

    nock('https://api.github.com')
      .post('/app/installations/7331/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/deadbeef/statuses')
      .reply(200, [])
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

    const newJob = await checkrunCompleted({
      check_run: {
        'head_sha': 'deadbeef',
        'status': 'completed',
        'conclusion': 'success'
      },
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
    const checkrunCompleted = require('../../../../jobs/github-event/check_run/completed')

    nock('https://api.github.com')
      .post('/app/installations/7331/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/club/mate/commits/catbus/statuses')
      .reply(200, [])
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

    const newJob = await checkrunCompleted({
      check_run: {
        'head_sha': 'catbus',
        'status': 'completed',
        'conclusion': 'success'
      },
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

  test('no initial pr, one successful status, one check pending', async () => {
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
      .get('/repos/club/mate/commits/busdog/statuses')
      .reply(200, [
        {
          'url': 'https://api.github.com/repos/octocat/Hello-World/statuses/6dcb09b5b57875f334f61aebed695e2e4193db5e',
          'avatar_url': 'https://github.com/images/error/hubot_happy.gif',
          'id': 1,
          'node_id': 'MDY6U3RhdHVzMQ==',
          'state': 'success',
          'description': 'Build has completed successfully',
          'target_url': 'https://ci.example.com/1000/output',
          'context': 'continuous-integration/jenkins',
          'created_at': '2012-07-20T01:19:13Z',
          'updated_at': '2012-07-20T01:19:13Z',
          'creator': {
            'login': 'octocat',
            'id': 1,
            'node_id': 'MDQ6VXNlcjE=',
            'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
            'gravatar_id': '',
            'url': 'https://api.github.com/users/octocat',
            'html_url': 'https://github.com/octocat',
            'followers_url': 'https://api.github.com/users/octocat/followers',
            'following_url': 'https://api.github.com/users/octocat/following{/other_user}',
            'gists_url': 'https://api.github.com/users/octocat/gists{/gist_id}',
            'starred_url': 'https://api.github.com/users/octocat/starred{/owner}{/repo}',
            'subscriptions_url': 'https://api.github.com/users/octocat/subscriptions',
            'organizations_url': 'https://api.github.com/users/octocat/orgs',
            'repos_url': 'https://api.github.com/users/octocat/repos',
            'events_url': 'https://api.github.com/users/octocat/events{/privacy}',
            'received_events_url': 'https://api.github.com/users/octocat/received_events',
            'type': 'User',
            'site_admin': false
          }
        }
      ])
      .get('/repos/club/mate/commits/busdog/check-runs')
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
      _id: '42:branch:busdog',
      type: 'branch',
      initial: true,
      sha: 'busdog'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'busdog',
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
      .get('/repos/club/mate/commits/pelicanballoon/statuses')
      .reply(200, [])
      .get('/repos/club/mate/commits/pelicanballoon/check-runs')
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
      _id: '42:branch:pelicanballoon',
      type: 'branch',
      initial: true,
      sha: 'pelicanballoon'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'pelicanballoon',
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

  test('no initial pr, one successful status, two successful checks', async () => {
    const { repositories } = await dbs()
    expect.assertions(4)
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
      .get('/repos/club/mate/commits/giraffeplane/statuses')
      .reply(200, [
        {
          'url': 'https://api.github.com/repos/octocat/Hello-World/statuses/6dcb09b5b57875f334f61aebed695e2e4193db5e',
          'avatar_url': 'https://github.com/images/error/hubot_happy.gif',
          'id': 1,
          'node_id': 'MDY6U3RhdHVzMQ==',
          'state': 'success',
          'description': 'Build has completed successfully',
          'target_url': 'https://ci.example.com/1000/output',
          'context': 'continuous-integration/jenkins',
          'created_at': '2012-07-20T01:19:13Z',
          'updated_at': '2012-07-20T01:19:13Z',
          'creator': {
            'login': 'octocat',
            'id': 1,
            'node_id': 'MDQ6VXNlcjE=',
            'avatar_url': 'https://github.com/images/error/octocat_happy.gif',
            'gravatar_id': '',
            'url': 'https://api.github.com/users/octocat',
            'html_url': 'https://github.com/octocat',
            'followers_url': 'https://api.github.com/users/octocat/followers',
            'following_url': 'https://api.github.com/users/octocat/following{/other_user}',
            'gists_url': 'https://api.github.com/users/octocat/gists{/gist_id}',
            'starred_url': 'https://api.github.com/users/octocat/starred{/owner}{/repo}',
            'subscriptions_url': 'https://api.github.com/users/octocat/subscriptions',
            'organizations_url': 'https://api.github.com/users/octocat/orgs',
            'repos_url': 'https://api.github.com/users/octocat/repos',
            'events_url': 'https://api.github.com/users/octocat/events{/privacy}',
            'received_events_url': 'https://api.github.com/users/octocat/received_events',
            'type': 'User',
            'site_admin': false
          }
        }
      ])
      .get('/repos/club/mate/commits/giraffeplane/check-runs')
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
      _id: '42:branch:giraffeplane',
      type: 'branch',
      initial: true,
      sha: 'giraffeplane'
    })

    const newJob = await githubStatus({
      state: 'success',
      sha: 'giraffeplane',
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
    expect(newJob.data.combined.state).toEqual('success')
    // Checks are also added to the combined.statuses array, so 2 checks + 1 status = 3
    expect(newJob.data.combined.statuses).toHaveLength(3)
    expect(newJob.data.name).toEqual('create-initial-pr')
  })
})
