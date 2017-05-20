const { test } = require('tap')

const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event')

test('github-event integration_installation_repositories removed', async t => {
  const { repositories } = await dbs()

  await repositories.bulkDocs([
    { _id: '22', accountId: '2' },
    { _id: '23', accountId: '2' },
    { _id: '24', accountId: '2' },
    { _id: '25', accountId: '2' },
    { _id: '26', accountId: '3' }
  ])

  const newJobs = await worker({
    type: 'integration_installation_repositories',
    action: 'removed',
    installation: { account: { id: 2 } },
    repositories_removed: [{ id: 22 }, { id: 25 }, { id: 26 }]
  })

  t.notOk(newJobs)

  const repos = await repositories.query('by_account', {
    key: '2'
  })

  t.is(repos.rows.length, 2)
  t.end()
})
