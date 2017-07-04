const { test } = require('tap')
const nock = require('nock')
const worker = require('../../jobs/create-initial-pr-comment')
const upsert = require('../../lib/upsert')

const dbs = require('../../lib/dbs')

const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

test('create-initial-pr-comment', async t => {
  const { installations, repositories } = await dbs()
  const runWorker = async () => {
    const branchDoc = await repositories.get('42:branch:deadbeef')
    const repository = await repositories.get('42')
    return worker({
      accountId: '123',
      branchDoc,
      prDocId: '42:pr:1234',
      repository,
      combined: {state: 'success'},
      installationId: '123'
    })
  }
  let githubNock

  t.beforeEach(async () => {
    githubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        name: 'test',
        html_url: 'https://github.com/finnp/test',
        newBranch: 'greenkeeper/initial'
      })

    await installations.put({
      _id: '123',
      installation: 37
    })

    await repositories.put({
      _id: '42',
      id: '42',
      accountId: '123',
      enabled: false,
      fullName: 'finnp/test',
      owner: {
        id: 123
      }
    })

    await repositories.put({
      _id: '42:branch:deadbeef',
      type: 'branch',
      initial: true,
      sha: 'deadbeef',
      base: 'master',
      head: 'greenkeeper/initial',
      processed: false,
      depsUpdated: true,
      travisModified: true,
      badgeAdded: true,
      badgeUrl: 'url'
    })

    await repositories.put({
      _id: '42:pr:1234',
      repositoryId: '42',
      accountId: '123',
      type: 'pr',
      initial: true,
      number: 1234,
      head: 'greenkeeper/initial',
      state: 'open'
    })
  })

  t.afterEach(async () => {
    nock.cleanAll()
    await installations.remove(await installations.get('123'))
    await repositories.remove(await repositories.get('42'))
    await repositories.remove(await repositories.get('42:branch:deadbeef'))
    await repositories.remove(await repositories.get('42:pr:1234'))
  })

  t.test('create comment for initial pr created by user', async t => {
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

    await runWorker()

    const prDoc = await repositories.get('42:pr:1234')
    t.ok(prDoc.initialPrCommentSent, 'initialPrCommentSent set to true')
    await waitFor(50)
  })

  t.test('does nothing if the repo has already received the comment', async t => {
    t.plan(1)

    await upsert(repositories, '42:pr:1234', {initialPrCommentSent: true})

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

    const newJob = await runWorker()

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

    const newJob = await runWorker()

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

    const newJob = await runWorker()

    t.notOk(newJob, 'no new job')
    await waitFor(50)
  })
})
