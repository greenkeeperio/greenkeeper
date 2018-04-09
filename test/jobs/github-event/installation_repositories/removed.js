const dbs = require('../../../../lib/dbs')
const githubEvent = require('../../../../jobs/github-event')

test('github-event installation_repositories removed', async () => {
  const { repositories } = await dbs()

  await repositories.bulkDocs([
    { _id: '22', accountId: '2' },
    { _id: '23', accountId: '2' },
    { _id: '24', accountId: '2' },
    { _id: '25', accountId: '2' },
    { _id: '26', accountId: '3' }
  ])

  const newJobs = await githubEvent({
    type: 'installation_repositories',
    action: 'removed',
    installation: { account: { id: 2 } },
    repositories_removed: [{ id: 22 }, { id: 25 }, { id: 26 }]
  })
  expect(newJobs).toBeFalsy()

  const repos = await repositories.query('by_account', {
    key: '2'
  })
  expect(repos.rows).toHaveLength(2)
})
