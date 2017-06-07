const { test, tearDown } = require('tap')
const nock = require('nock')
const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event/pull_request/closed')

test('github-event pull_request closed', async t => {
  const { repositories } = await dbs()
  await Promise.all([
    repositories.put({
      _id: '42',
      enabled: false,
      repositoryId: '42'
    }),
    repositories.put({
      _id: '42:pr:666',
      initial: true,
      head: 'thehead',
      repositoryId: '42'
    })
  ])

  t.test('initial pr merged', async t => {
    t.plan(6)
    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .delete('/repos/finnp/test/git/refs/heads/thehead')
      .reply(200, () => {
        t.pass('deleted reference')
      })

    const newJob = await worker({
      installation: {
        id: 37
      },
      pull_request: {
        id: 666,
        merged: true,
        state: 'closed'
      },
      repository: {
        full_name: 'finnp/test',
        id: 42,
        owner: {
          id: 10
        }
      }
    })

    t.notOk(newJob, 'no new job')
    const pr = await repositories.get('42:pr:666')
    t.is(pr.state, 'closed', 'pr status is closed')
    t.is(pr.merged, true, 'pr is merged')
    t.ok(pr.updatedAt, 'updatedAt is updated')
    const repository = await repositories.get('42')
    t.ok(repository.enabled, 'repository is enabled')
    t.end()
  })
})

tearDown(async () => {
  const { repositories } = await dbs()
  await Promise.all([
    repositories.remove(await repositories.get('42:pr:666')),
    repositories.remove(await repositories.get('42'))
  ])
})
