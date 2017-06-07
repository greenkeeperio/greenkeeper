const { test, tearDown } = require('tap')
const proxyquire = require('proxyquire').noCallThru()
const nock = require('nock')

const dbs = require('../../../lib/dbs')

test('github-event status', async t => {
  const { repositories, installations } = await dbs()

  await installations.put({
    _id: '10',
    installation: '1337'
  })

  t.test('initial pr', async t => {
    t.plan(6)
    const worker = require('../../../jobs/github-event/status')

    nock('https://api.github.com')
      .post('/installations/1336/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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

    t.ok(newJob, 'new Job')
    t.equals(newJob.data.name, 'create-initial-pr', 'create-initial-pr')
    t.is(newJob.data.branchDoc.sha, 'deadbeef', 'branchDoc sha')
    t.is(newJob.data.repository.id, 42, 'repositoryId')
    t.is(newJob.data.combined.state, 'success', 'combined status')
    t.is(newJob.data.installationId, 1336)
  })

  t.test('version branch', async t => {
    t.plan(6)
    const worker = proxyquire('../../../jobs/github-event/status', {
      '../../lib/create-initial-pr': () => {
        t.fail('create initial pr called')
      },
      '../../lib/handle-branch-status': args => {
        t.is(args.installationId, 1337, 'installationId')
        t.is(args.branchDoc.dependency, 'test')
        t.is(args.accountId, '10', 'accountId')
        t.is(args.repository.id, 43, 'repositoryId')
        t.is(args.combined.state, 'success', 'state === sucess')
      }
    })

    nock('https://api.github.com')
      .post('/installations/1337/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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

    const newJobs = await worker({
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

    t.notOk(newJobs, 'no new jobs')
  })
})

tearDown(async () => {
  const { repositories, installations } = await dbs()
  await Promise.all([
    repositories.remove(await repositories.get('42:branch:deadbeef')),
    repositories.remove(await repositories.get('43:branch:deadbeef')),
    installations.remove(await installations.get('10'))
  ])
})
