const { test } = require('tap')

const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event')

test('github-event integration_installation deleted', async t => {
  t.plan(3)
  const { installations, repositories } = await dbs()

  await Promise.all([
    installations.put({
      _id: '2',
      installation: 1
    }),
    repositories.put({
      _id: '4',
      accountId: '2'
    })
  ])

  const newJobs = await worker({
    type: 'integration_installation',
    action: 'deleted',
    installation: { account: { id: 2 } }
  })

  t.notOk(newJobs)

  try {
    await installations.get('2')
  } catch (e) {
    t.is(e.status, 404, 'installation is deleted')
  }

  const repos = await repositories.query('by_account', {
    key: '2'
  })

  t.is(repos.rows.length, 0, 'repositories are deleted')
})
