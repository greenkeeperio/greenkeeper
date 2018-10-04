const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const deleteBranches = require('../../lib/delete-branches')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

afterAll(async () => {
  const { repositories } = await dbs()
  await Promise.all([
    removeIfExists(repositories, '6464:branch:deadbeef', '6465:branch:deadbeef')
  ])
})

test('deleteBranches', async () => {
  const { repositories } = await dbs()

  await repositories.put({
    _id: '6464:branch:deadbeef',
    type: 'branch',
    repositoryId: '6464',
    head: 'greenkeeper/standard-9.0.0',
    dependency: 'standard',
    version: '9.0.0',
    dependencyType: 'dependencies'
  })

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper/standard-9.0.0')
    .reply(200)

  const branch = await repositories.get('6464:branch:deadbeef')
  await deleteBranches(
    { installationId: 123, fullName: 'brot/lecker', repositoryId: '6464' },
    branch
  )
  const branchAfterDelete = await repositories.get('6464:branch:deadbeef')
  expect(branchAfterDelete.referenceDeleted).toBeTruthy()
})

test('deleteBranches failed to delete', async () => {
  const { repositories } = await dbs()

  await repositories.put({
    _id: '6465:branch:deadbeef',
    type: 'branch',
    repositoryId: '6465',
    head: 'greenkeeper/standard-9.0.0',
    dependency: 'standard',
    version: '9.0.0',
    dependencyType: 'dependencies'
  })

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper/standard-9.0.0')
    .reply(500)

  const branch = await repositories.get('6465:branch:deadbeef')
  await deleteBranches(
    { installationId: 123, fullName: 'brot/lecker', repositoryId: '6465' },
    branch
  )
  const branchAfterDelete = await repositories.get('6465:branch:deadbeef')
  expect(branchAfterDelete.referenceDeleted).toBeFalsy()
})
