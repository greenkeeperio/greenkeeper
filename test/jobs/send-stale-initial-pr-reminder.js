const { test } = require('tap')
const nock = require('nock')
const worker = require('../../jobs/send-stale-initial-pr-reminder')
const upsert = require('../../lib/upsert')

const dbs = require('../../lib/dbs')

const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

test('send-stale-initial-pr-reminder', async t => {
  const { installations, repositories } = await dbs()

  let githubNock

  t.beforeEach(async () => {
    githubNock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})

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

  t.afterEach(async () => {
    nock.cleanAll()
    await installations.remove(await installations.get('123'))
    await repositories.remove(await repositories.get('42'))
  })

  t.test('send reminders for stale initial pr', async t => {
    t.plan(2)

    githubNock
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'open',
        locked: false
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        t.pass('comment added')
        return {}
      })

    await worker({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    const repoDoc = await repositories.get('42')
    t.ok(repoDoc.staleInitialPRReminder, 'staleInitialPRReminder set to true')
    await waitFor(50)
  })

  t.test('does nothing if the repo is already enabled', async t => {
    t.plan(1)

    await upsert(repositories, '42', {enabled: true})

    githubNock
      .get('/repos/finnp/test/issues/1234')
      .reply(200, () => {
        t.fail('Should not query issue status')
        return {}
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        t.fail('Should not post comment')
        return {}
      })

    const newJob = await worker({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    t.notOk(newJob, 'no new job')
    await waitFor(50)
  })

  t.test('does nothing if the issue was closed in the meanwhile', async t => {
    t.plan(1)

    githubNock
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'closed',
        locked: false
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        t.fail('Should not post comment')
        return {}
      })

    const newJob = await worker({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    t.notOk(newJob, 'no new job')
    await waitFor(50)
  })

  t.test('does nothing if the issue was locked in the meanwhile', async t => {
    t.plan(1)

    githubNock
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'open',
        locked: true
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        t.fail('Should not post comment')
        return {}
      })

    const newJob = await worker({
      prNumber: 1234,
      repositoryId: 42,
      accountId: 123
    })

    t.notOk(newJob, 'no new job')
    await waitFor(50)
  })
})
