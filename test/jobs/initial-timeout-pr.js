const {test, tearDown} = require('tap')
const nock = require('nock')
const dbs = require('../../lib/dbs')
const proxyquire = require('proxyquire').noCallThru()

const worker = proxyquire('../../jobs/initial-timeout-pr', {
  '../lib/get-token': () => ({ token: 'secure' })
})

test('initial-timeout-pr', async t => {
  const { installations, repositories } = await dbs()
  await installations.put({
    _id: '10101',
    installation: 37
  })
  await repositories.put({
    _id: '666',
    fullName: 'finnp/test'
  })

  t.test('create', async (t) => {
    const ghMock = nock('https://api.github.com')
      .post('/repos/finnp/test/issues', ({ title, body, labels }) => {
        t.ok(title, 'github issue has title')
        t.same(labels, ['greenkeeper'], 'github issue label')
        t.ok(body, 'github issue has body')
        return true
      })
      .reply(201, () => {
        t.pass('issue created')
        return {
          number: 10
        }
      })

    const newJobs = await worker({
      repositoryId: 666,
      accountId: 10101
    })
    t.notOk(newJobs)
    const issue = await repositories.get('666:issue:10')
    t.ok(issue.initial)
    t.is(issue.type, 'issue')
    t.is(issue.repositoryId, 666)
    t.is(issue.number, 10)
    ghMock.done()
    t.end()
  })

  t.test('already exists', async (t) => {
    nock('https://api.github.com') // no request should be made

    await installations.put({
      _id: '1338',
      installation: 38
    })
    await repositories.put({
      _id: '6666:pr:11',
      type: 'pr',
      repositoryId: '6666',
      head: 'greenkeeper/initial'
    })

    const newJobs = await worker({
      repositoryId: 6666,
      accountId: 1338
    })

    t.notOk(newJobs)
    try {
      await repositories.get('6666:issue:10')
      t.fail('created an issue')
    } catch (e) {
      t.pass('throws')
    }
    t.end()
  })
})

tearDown(async () => {
  const { repositories, installations } = await dbs()

  await Promise.all([
    repositories.remove(await repositories.get('666')),
    repositories.remove(await repositories.get('666:issue:10')),
    repositories.remove(await repositories.get('6666:pr:11')),
    installations.remove(await installations.get('10101')),
    installations.remove(await installations.get('1338'))
  ])
})
