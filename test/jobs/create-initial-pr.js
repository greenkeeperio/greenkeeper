const { test, tearDown } = require('tap')
const nock = require('nock')

const dbs = require('../../lib/dbs')
const proxyquire = require('proxyquire').noCallThru()

test('create-initial-branch', async t => {
  const { installations, repositories } = await dbs()

  await installations.put({
    _id: '123',
    installation: 37,
    plan: 'free'
  })

  t.test('create pr', async t => {
    await repositories.put({
      _id: '42',
      accountId: '123',
      fullName: 'finnp/test'
    })
    await repositories.put({
      _id: '42:branch:1234abcd',
      type: 'branch',
      initial: true,
      sha: '1234abcd',
      base: 'master',
      head: 'greenkeeper/initial',
      processed: false,
      depsUpdated: true,
      badgeUrl: 'https://badges.greenkeeper.io/finnp/test.svg',
      createdAt: '2017-01-13T17:33:56.698Z',
      updatedAt: '2017-01-13T17:33:56.698Z'
    })

    t.plan(4)

    nock('https://api.github.com')
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/statuses/1234abcd')
      .reply(201, () => {
        t.pass('verify status added')
        return {}
      })
      .post(
        '/repos/finnp/test/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/test/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        t.pass('label created')
        return {}
      })

    const createInitial = proxyquire('../../jobs/create-initial-pr',
      { '../lib/get-token': (installationId) => {
        t.equals(installationId, 11)
        return { token: 'secure' }
      }})

    await createInitial({
      repository: { id: 42 },
      branchDoc: await repositories.get('42:branch:1234abcd'),
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: 7
    })
  })
})

tearDown(async () => {
  const { installations, repositories } = await dbs()

  await installations.remove(await installations.get('123'))
  await repositories.remove(await repositories.get('42'))
  await repositories.remove(await repositories.get('42:branch:1234abcd'))
})
