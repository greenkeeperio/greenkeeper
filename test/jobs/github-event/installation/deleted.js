const dbs = require('../../../../lib/dbs')
const githubEvent = require('../../../../jobs/github-event')

jest.setTimeout(10000)

test('github-event installation deleted', async () => {
  expect.assertions(3)
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

  const newJobs = await githubEvent({
    type: 'installation',
    action: 'deleted',
    installation: { account: { id: 2 } }
  })

  expect(newJobs).toBeFalsy()

  try {
    await installations.get('2')
  } catch (e) {
    // installation is deleted
    expect(e.status).toBe(404)
  }

  const repos = await repositories.query('by_account', {
    key: '2'
  })

  // repositories are deleted
  expect(repos.rows).toHaveLength(0)
})
