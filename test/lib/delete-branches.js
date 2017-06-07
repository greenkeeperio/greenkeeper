const { test, tearDown } = require('tap')
const nock = require('nock')

const dbs = require('../../lib/dbs')

const deleteBranches = require('../../lib/delete-branches')

test('delete-branches', async t => {
  t.plan(5)

  const { installations, repositories } = await dbs()

  await Promise.all([
    installations.put({
      _id: '123',
      installation: 37
    }),
    repositories.put({
      _id: '42:branch:deadbeef0',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper-standard-9.0.0',
      dependency: 'standard',
      version: '9.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42:branch:deadbeef',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper-standard-10.0.0',
      dependency: 'standard',
      version: '10.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42:branch:deadbeef1',
      type: 'branch',
      repositoryId: '42',
      head: 'greenkeeper-standard-11.0.0',
      dependency: 'standard',
      version: '11.0.0',
      dependencyType: 'dependencies'
    })
  ])

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper-standard-10.0.0')
    .reply(200, () => {
      t.pass('deleted 10.0.0')
      return {}
    })
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper-standard-9.0.0')
    .reply(200, () => {
      t.pass('deleted 9.0.0')
      return {}
    })

  await deleteBranches(
    { installationId: '123', fullName: 'brot/lecker', repositoryId: '42' },
    {
      change: 'modified',
      after: '^10.0.0',
      dependency: 'standard',
      dependencyType: 'dependencies'
    }
  )

  const [branch, older, newer] = await Promise.all([
    repositories.get('42:branch:deadbeef'),
    repositories.get('42:branch:deadbeef0'),
    repositories.get('42:branch:deadbeef1')
  ])
  t.ok(branch.referenceDeleted, 'Branch was deleted')
  t.ok(older.referenceDeleted, 'Older Branch was deleted')
  t.notOk(newer.referenceDeleted, 'Newer Branch was not deleted')
})

tearDown(async () => {
  const { installations, repositories } = await dbs()

  await installations.remove(await installations.get('123'))
  await repositories.remove(await repositories.get('42:branch:deadbeef'))
  await repositories.remove(await repositories.get('42:branch:deadbeef0'))
  await repositories.remove(await repositories.get('42:branch:deadbeef1'))
})
