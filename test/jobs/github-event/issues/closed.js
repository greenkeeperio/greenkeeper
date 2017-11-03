const { test, tearDown } = require('tap')

const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event/issues/closed')

test('github-event issues closed', async t => {
  const { repositories } = await dbs()

  await repositories.put({
    _id: '42:issue:666',
    dependency: '@finnpauls/dep',
    version: '2.2.2',
    repositoryId: '42'
  })

  const newJob = await worker({
    issue: {
      number: 666
    },
    repository: {
      id: 42,
      full_name: 'test/test',
      owner: {
        id: 1234
      }
    }
  })

  t.notOk(newJob, 'no new job')
  const issue = await repositories.get('42:issue:666')
  t.is(issue.state, 'closed', 'status is closed')
  t.ok(issue.updatedAt, 'updated updatedAt')
  t.end()
})

tearDown(async () => {
  const { repositories } = await dbs()
  repositories.remove(await repositories.get('42:issue:666'))
})
