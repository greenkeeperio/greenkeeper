const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists.js')

const timeToWaitAfterTests = 500
const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

const githubRepository = {
  id: 42,
  full_name: 'finnp/abc',
  private: false,
  fork: false,
  has_issues: true
}

describe('reset repo', async () => {
  const resetJob = require('../../jobs/reset')
  beforeEach(async () => {
    const { repositories, installations } = await dbs()

    await installations.put({
      _id: '123',
      installation: 37
    })
    await repositories.put({
      _id: '42',
      accountId: '123',
      enabled: true,
      fullName: 'finnp/abc',
      type: 'repository'
    })
    await repositories.put({
      _id: '42:pr:123',
      repositoryId: '42',
      type: 'pr'
    })
    await repositories.put({
      _id: '42:branch:deadbeef',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper-standard-10.0.0',
      dependency: 'standard',
      version: '10.0.0',
      dependencyType: 'dependencies'
    })
  })

  afterEach(async () => {
    nock.cleanAll()
    const { repositories, installations } = await dbs()
    await removeIfExists(
      repositories,
      [
        '42', '42:pr:123', '42:branch:deadbeef', '42:branch:deadbeef0',
        '42:issue:67', '42:issue:65'
      ]
    )
    await removeIfExists(installations, '123')
  })

  test('create a tmp repo if repo could not be found (given accountId)', async () => {
    const newRepository = {
      id: 'hi-finnp',
      full_name: 'finnp/hi',
      private: false,
      type: 'repository',
      fork: false,
      has_issues: true
    }
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, { token: 'secret' })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/hi')
      .reply(200, newRepository)

    await resetJob({
      repositoryFullName: 'finnp/hi',
      accountId: '123'
    })

    const { repositories } = await dbs()
    const freshRepoDoc = await repositories.get('hi-finnp')
    expect(freshRepoDoc.fullName).toEqual('finnp/hi')
    expect(freshRepoDoc.enabled).toBeFalsy()
    expect(freshRepoDoc.type).toEqual('repository')
    expect(freshRepoDoc.accountId).toEqual('123')

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('create a tmp repo if repo could not be found (without accountId)', async () => {
    const newRepository = {
      id: 'hi-finnp',
      full_name: 'finnp/hi',
      private: false,
      type: 'repository',
      fork: false,
      has_issues: true
    }
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, { token: 'secret' })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/hi')
      .reply(200, newRepository)

    await resetJob({
      repositoryFullName: 'finnp/hi'
    })

    const { repositories } = await dbs()
    const freshRepoDoc = await repositories.get('hi-finnp')
    expect(freshRepoDoc.fullName).toEqual('finnp/hi')
    expect(freshRepoDoc.enabled).toBeFalsy()
    expect(freshRepoDoc.type).toEqual('repository')
    expect(freshRepoDoc.accountId).toEqual('123')

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('delete all prdocs of the repo', async () => {
    expect.assertions(1)
    nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })

    const { repositories } = await dbs()
    // PrDocs successfully deleted
    await expect(repositories.get('42:pr:123')).rejects.toThrow()
    await waitFor(timeToWaitAfterTests)
  })

  test('delete all greenkeeper branches', async () => {
    expect.assertions(3)

    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, () => {
        // deleted gk branch
        expect(true).toBeTruthy()
      })
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })
    // Worker ran successfully
    expect(true).toBeTruthy()
    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('do not mind if some dependency branch could not be deleted', async () => {
    expect.assertions(2)

    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(409)
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })
    // Worker ran successfully
    expect(true).toBeTruthy()
    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('fail if initial branch could not be deleted', async () => {
    expect.assertions(2)
    const { repositories } = await dbs()
    await repositories.put({
      _id: '42:branch:deadbeef0',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper/initial'
    })
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200)
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper/initial')
      .reply(409)

    try {
      await resetJob({
        repositoryFullName: 'finnp/abc'
      })
    } catch (e) {
      if (e.status !== 409) {
        throw e
      }
      // error thrown
      expect(e.status).toBe(409)
    } finally {
      expect(githubNock.isDone()).toBeTruthy()
      await waitFor(timeToWaitAfterTests)
    }
  })

  test('do not mind if a branch does not exist', async () => {
    const { repositories } = await dbs()

    await repositories.put({
      _id: '42:branch:deadbeef0',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper/initial'
    })
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200)
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper/initial')
      .reply(422)
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    try {
      await resetJob({
        repositoryFullName: 'finnp/abc'
      })
    } catch (e) {
      // error thrown
      expect(true).toBeTruthy()
    } finally {
      expect(githubNock.isDone()).toBeTruthy()
      await waitFor(timeToWaitAfterTests)
    }
  })

  test('delete all branchdocs of the repo', async () => {
    expect.assertions(2)
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })

    const { repositories } = await dbs()
    try {
      await repositories.get('42:branch:deadbeef')
    } catch (e) {
      if (e.status !== 404) {
        throw e
      }
      // BranchDocs successfully deleted
      expect(true).toBeTruthy()
    } finally {
      expect(githubNock.isDone()).toBeTruthy()
      await waitFor(timeToWaitAfterTests)
    }
  })

  test('delete the repodoc and create a fresh one', async () => {
    expect.assertions(2)
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })

    const { repositories } = await dbs()
    const freshRepoDoc = await repositories.get('42')
    expect(freshRepoDoc.enabled).toBeFalsy()

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('schedule create inital branch job', async () => {
    expect.assertions(3)
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    const newJob = await resetJob({
      repositoryFullName: 'finnp/abc'
    })

    const { repositories } = await dbs()
    const freshRepoDoc = await repositories.get('42')
    const job = newJob.data
    expect(job.name).toEqual('create-initial-branch')
    expect(job.repositoryId).toEqual(freshRepoDoc._id)

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('Close open issues and delete them from the database', async () => {
    expect.assertions(4)
    const { repositories } = await dbs()
    await repositories.put({
      _id: '42:issue:67',
      type: 'issue',
      repositoryId: '42',
      number: 67,
      state: 'closed'
    })
    await repositories.put({
      _id: '42:issue:65',
      type: 'issue',
      repositoryId: '42',
      number: 65,
      state: 'open'
    })

    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
      .patch('/repos/finnp/abc/issues/65')
      .reply(200, () => {
        // Issue closed
        expect(true).toBeTruthy()
        return {}
      })
      .patch('/repos/finnp/abc/issues/67')
      .optionally()
      .reply(200, () => {
        // should not close closed Issues
        expect(false).toBeFalsy()
        return {}
      })
    await resetJob({
      repositoryFullName: 'finnp/abc'
    })
    try {
      await repositories.get('42:issue:67')
    } catch (e) {
      if (e.status === 404) {
        // Issue doc deleted
        expect(true).toBeTruthy()
      } else {
        throw e
      }
    }
    try {
      await repositories.get('42:issue:65')
    } catch (e) {
      if (e.status === 404) {
        // Issue doc deleted
        expect(true).toBeTruthy()
      } else {
        throw e
      }
    }

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('Do not mind issues that do not exist', async () => {
    expect.assertions(2)
    const { repositories } = await dbs()

    await repositories.put({
      _id: '42:issue:65',
      type: 'issue',
      repositoryId: '42',
      number: 65,
      state: 'open'
    })
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
      .patch('/repos/finnp/abc/issues/65')
      .reply(404)

    await resetJob({
      repositoryFullName: 'finnp/abc'
    })

    // no errors were thrown
    expect(true).toBeTruthy()

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('Do not mind about case sensivity in the repository name', async () => {
    expect.assertions(3)
    const githubNock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    const newJob = await resetJob({
      repositoryFullName: 'Finnp/aBc'
    })

    const { repositories } = await dbs()
    const freshRepoDoc = await repositories.get('42')
    const job = newJob.data
    expect(job.name).toEqual('create-initial-branch')
    expect(job.repositoryId).toEqual(freshRepoDoc._id)

    expect(githubNock.isDone()).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })
})
