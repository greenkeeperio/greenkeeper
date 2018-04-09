const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists')
const closeIssue = require('../../../../jobs/github-event/issues/closed')

afterAll(async () => {
  const { repositories } = await dbs()
  await removeIfExists(repositories, '42:issue:666')
})

test('github-event issues closed', async () => {
  const { repositories } = await dbs()

  await repositories.put({
    _id: '42:issue:666',
    dependency: '@finnpauls/dep',
    version: '2.2.2',
    repositoryId: '42'
  })

  const newJob = await closeIssue({
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

  expect(newJob).toBeFalsy()
  const issue = await repositories.get('42:issue:666')

  expect(issue.state).toEqual('closed')
  expect(issue.updatedAt).toBeTruthy()
})
