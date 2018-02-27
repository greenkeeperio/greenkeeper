const nock = require('nock')
const dbs = require('../../lib/dbs')
const upsert = require('../../lib/upsert')
const removeIfExists = require('../helpers/remove-if-exists')

const timeToWaitAfterTests = 50
const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create-initial-pr-comment', async () => {
  const createInitialPrComment = require('../../jobs/create-initial-pr-comment')

  beforeEach(async () => {
    const { installations, repositories } = await dbs()

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

  afterEach(async () => {
    nock.cleanAll()
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(repositories, '42', '42:branch:deadbeef', '42:pr:1234')
    ])
  })

  test('create comment for initial pr created by user', async () => {
    expect.assertions(2)

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        name: 'test',
        html_url: 'https://github.com/finnp/test',
        newBranch: 'greenkeeper/initial'
      })
      .get('/repos/finnp/test/issues/1234')
      .reply(200, {
        state: 'open',
        locked: false
      })
      .post('/repos/finnp/test/issues/1234/comments')
      .reply(201, () => {
        // comment added
        expect(true).toBeTruthy()
        return {}
      })

    const { repositories } = await dbs()
    const branchDoc = await repositories.get('42:branch:deadbeef')
    const repository = await repositories.get('42')

    await createInitialPrComment({
      accountId: '123',
      branchDoc,
      prDocId: '42:pr:1234',
      repository,
      combined: {state: 'success'},
      installationId: '123'
    })

    const prDoc = await repositories.get('42:pr:1234')
    expect(prDoc.initialPrCommentSent).toBeTruthy()
    await waitFor(timeToWaitAfterTests)
  })

  test('does nothing if the repo has already received the comment', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
    await upsert(repositories, '42:pr:1234', {initialPrCommentSent: true})

    nock('https://api.github.com') // eslint-disable-line
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        name: 'test',
        html_url: 'https://github.com/finnp/test',
        newBranch: 'greenkeeper/initial'
      })
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

    const branchDoc = await repositories.get('42:branch:deadbeef')
    const repository = await repositories.get('42')

    const newJob = await createInitialPrComment({
      accountId: '123',
      branchDoc,
      prDocId: '42:pr:1234',
      repository,
      combined: {state: 'success'},
      installationId: '123'
    })

    expect(newJob).toBeFalsy()
    await waitFor(timeToWaitAfterTests)
  })

  test('does nothing if the issue was closed in the meanwhile', async () => {
    expect.assertions(1)

    nock('https://api.github.com') // eslint-disable-line
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        name: 'test',
        html_url: 'https://github.com/finnp/test',
        newBranch: 'greenkeeper/initial'
      })
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

    const { repositories } = await dbs()
    const branchDoc = await repositories.get('42:branch:deadbeef')
    const repository = await repositories.get('42')

    const newJob = await createInitialPrComment({
      accountId: '123',
      branchDoc,
      prDocId: '42:pr:1234',
      repository,
      combined: {state: 'success'},
      installationId: '123'
    })

    expect(newJob).toBeFalsy()
    await waitFor(timeToWaitAfterTests)
  })

  test('does nothing if the issue was locked in the meanwhile', async () => {
    expect.assertions(1)

    nock('https://api.github.com') // eslint-disable-line
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        name: 'test',
        html_url: 'https://github.com/finnp/test',
        newBranch: 'greenkeeper/initial'
      })
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

    const { repositories } = await dbs()
    const branchDoc = await repositories.get('42:branch:deadbeef')
    const repository = await repositories.get('42')

    const newJob = await createInitialPrComment({
      accountId: '123',
      branchDoc,
      prDocId: '42:pr:1234',
      repository,
      combined: {state: 'success'},
      installationId: '123'
    })

    expect(newJob).toBeFalsy()
    await waitFor(timeToWaitAfterTests)
  })
})
