const nock = require('nock')
const upsert = require('../../lib/upsert')

const dbs = require('../../lib/dbs')

const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('send-stale-initial-pr-reminder', async () => {
  const sendStaleInitialPrReminder = require('../../jobs/send-stale-initial-pr-reminder')

  beforeEach(async () => {
    const { installations, repositories } = await dbs()

    await installations.put({
      _id: '123',
      installation: 37
    })

    await repositories.put({
      _id: '42',
      accountId: '123',
      enabled: false,
      fullName: 'finnp/test'
    })
  })

  afterEach(async () => {
    nock.cleanAll()
    const { installations, repositories } = await dbs()
    await installations.remove(await installations.get('123'))
    await repositories.remove(await repositories.get('42'))
  })

  test('send reminders for stale initial pr', async () => {
    expect.assertions(3)

    nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'open',
        locked: false
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, (uri, requestBody) => {
        expect(requestBody).toBeDefined()
        expect(requestBody).toMatch(/body/)
        return {}
      })

    await sendStaleInitialPrReminder({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    const { repositories } = await dbs()
    const repoDoc = await repositories.get('42')
    expect(repoDoc.staleInitialPRReminder).toBeTruthy()
    await waitFor(50)
  })

  test('does nothing if the repo is already enabled', async () => {
    expect.assertions(1)
    const { repositories } = await dbs()
    await upsert(repositories, '42', { enabled: true })

    nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test/issues/1234')
      .reply(200, () => {
        // Should not query issue status
        expect(false).toBeFalsy()
        return {}
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        // Should not post comment
        expect(false).toBeFalsy()
        return {}
      })

    const newJob = await sendStaleInitialPrReminder({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    expect(newJob).toBeFalsy()
    await waitFor(50)
  })

  test('does nothing if the repo has already received the reminder', async () => {
    expect.assertions(1)
    const { repositories } = await dbs()
    await upsert(repositories, '42', { staleInitialPRReminder: true })

    nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test/issues/1234')
      .reply(200, () => {
        // Should not query issue status
        expect(false).toBeFalsy()
        return {}
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        // Should not post comment
        expect(false).toBeFalsy()
        return {}
      })

    const newJob = await sendStaleInitialPrReminder({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    expect(newJob).toBeFalsy()
    await waitFor(50)
  })

  test('does nothing if the issue was closed in the meanwhile', async () => {
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
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'closed',
        locked: false
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        // Should not post comment
        expect(false).toBeFalsy()
        return {}
      })

    const newJob = await sendStaleInitialPrReminder({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    expect(newJob).toBeFalsy()
    await waitFor(50)
  })

  test('does nothing if the issue was locked in the meanwhile', async () => {
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
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'open',
        locked: true
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        // Should not post comment
        expect(false).toBeFalsy()
        return {}
      })

    const newJob = await sendStaleInitialPrReminder({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    expect(newJob).toBeFalsy()
    await waitFor(50)
  })
})
