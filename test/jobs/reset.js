const { test } = require('tap')
const nock = require('nock')
const worker = require('../../jobs/reset')
const removeIfExists = require('../helpers/remove-if-exists.js')

const dbs = require('../../lib/dbs')
const timeToWaitAfterTests = 500

const waitFor = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

nock.disableNetConnect()
nock.enableNetConnect('localhost')

let githubNock

const githubRepository = {
  id: 42,
  full_name: 'finnp/abc',
  private: false,
  fork: false,
  has_issues: true
}

test('reset repo', async t => {
  const { repositories, installations } = await dbs()

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

  t.afterEach(async () => {
    nock.cleanAll()
    await removeIfExists(repositories, '42', '42:pr:123', '42:branch:deadbeef', '42:branch:deadbeef0', '42:issue:67', '42:issue:65')
    await removeIfExists(installations, '123')
  })

  t.test('response with error if repo cound not be found', async t => {
    t.plan(1)
    nock.cleanAll()
    try {
      await worker({
        repositoryFullName: 'finnp/hello'
      })
    } catch (e) {
      if (e.status !== 404) {
        throw e
      }
      t.equal(e.message, 'The repository finnp/hello does not exist in the database', 'correct error thrown')
    } finally {
      await waitFor(timeToWaitAfterTests)
    }
  })

  t.test('delete all prdocs of the repo', async t => {
    t.plan(1)
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
    await worker({
      repositoryFullName: 'finnp/abc'
    })
    try {
      await repositories.get('42:pr:123')
    } catch (e) {
      if (e.status !== 404) {
        throw e
      }
      t.ok(true, 'PrDocs successfully deleted')
    } finally {
      await waitFor(timeToWaitAfterTests)
    }
  })

  t.test('delete all greenkeeper branches', async t => {
    t.plan(2)

    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, () => {
        t.ok(true, 'deleted gk branch')
      })
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await worker({
      repositoryFullName: 'finnp/abc'
    })
    t.ok(true, 'Worker ran successfully')
    await waitFor(timeToWaitAfterTests)
  })

  t.test('do not mind if some dependency branch could not be deleted', async t => {
    t.plan(1)

    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(409)
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    await worker({
      repositoryFullName: 'finnp/abc'
    })
    t.ok(true, 'Worker ran successfully')
    await waitFor(timeToWaitAfterTests)
  })

  t.test('fail if initial branch could not be deleted', async t => {
    t.plan(1)
    await repositories.put({
      _id: '42:branch:deadbeef0',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper/initial'
    })
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200)
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper/initial')
      .reply(409)

    try {
      await worker({
        repositoryFullName: 'finnp/abc'
      })
    } catch (e) {
      if (e.code !== 409) {
        throw e
      }
      t.equal(e.code, 409, 'error thrown')
    } finally {
      await waitFor(timeToWaitAfterTests)
    }
  })

  t.test('do not mind if a branch does not exist', async t => {
    await repositories.put({
      _id: '42:branch:deadbeef0',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper/initial'
    })
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200)
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper/initial')
      .reply(422)
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)

    try {
      await worker({
        repositoryFullName: 'finnp/abc'
      })
    } catch (e) {
      t.fail('error thrown')
    } finally {
      await waitFor(timeToWaitAfterTests)
    }
  })

  t.test('delete all branchdocs of the repo', async t => {
    t.plan(1)
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
    await worker({
      repositoryFullName: 'finnp/abc'
    })
    try {
      await repositories.get('42:branch:deadbeef')
    } catch (e) {
      if (e.status !== 404) {
        throw e
      }
      t.ok(true, 'BranchDocs successfully deleted')
    } finally {
      await waitFor(timeToWaitAfterTests)
    }
  })

  t.test('delete the repodoc and create a fresh one', async t => {
    t.plan(1)
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
    await worker({
      repositoryFullName: 'finnp/abc'
    })
    const freshRepoDoc = await repositories.get('42')
    t.false(freshRepoDoc.enabled, 'New RepoDoc saved in database')
    await waitFor(timeToWaitAfterTests)
  })

  t.test('schedule create inital branch job', async t => {
    t.plan(2)
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
    const newJob = await worker({
      repositoryFullName: 'finnp/abc'
    })
    const freshRepoDoc = await repositories.get('42')
    t.equal(newJob.data.name, 'create-initial-branch', 'create-initial-branch Job enqueued')
    t.equal(newJob.data.repositoryId, freshRepoDoc._id, 'Job has the correct repository id')
    await waitFor(timeToWaitAfterTests)
  })

  t.test('Close open issues and delete them from the database', async t => {
    t.plan(3)
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

    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
      .patch('/repos/finnp/abc/issues/65')
      .reply(200, () => {
        t.ok(true, 'Issue closed')
        return {}
      })
      .patch('/repos/finnp/abc/issues/67')
      .optionally()
      .reply(200, () => {
        t.fail('should not close closed Issues')
        return {}
      })
    await worker({
      repositoryFullName: 'finnp/abc'
    })
    try {
      await repositories.get('42:issue:67')
    } catch (e) {
      if (e.status === 404) {
        t.ok(true, 'Issue doc deleted')
      } else {
        throw e
      }
    }
    try {
      await repositories.get('42:issue:65')
    } catch (e) {
      if (e.status === 404) {
        t.ok(true, 'Issue doc deleted')
      } else {
        throw e
      }
    }
    await waitFor(timeToWaitAfterTests)
  })

  t.test('Do not mind issues that do not exist', async t => {
    t.plan(1)

    await repositories.put({
      _id: '42:issue:65',
      type: 'issue',
      repositoryId: '42',
      number: 65,
      state: 'open'
    })
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
      .patch('/repos/finnp/abc/issues/65')
      .reply(404)

    await worker({
      repositoryFullName: 'finnp/abc'
    })

    t.ok(true, 'no errors were thrown')
    await waitFor(timeToWaitAfterTests)
  })

  t.test('Do not mind about case sensivity in the repository name', async t => {
    t.plan(2)
    githubNock
      .delete('/repos/finnp/abc/git/refs/heads/greenkeeper-standard-10.0.0')
      .reply(200, {})
      .get('/repos/finnp/abc')
      .reply(200, githubRepository)
    const newJob = await worker({
      repositoryFullName: 'Finnp/aBc'
    })
    const freshRepoDoc = await repositories.get('42')
    t.equal(newJob.data.name, 'create-initial-branch', 'create-initial-branch Job enqueued')
    t.equal(newJob.data.repositoryId, freshRepoDoc._id, 'Job has the correct repository id')
    await waitFor(timeToWaitAfterTests)
  })
})
