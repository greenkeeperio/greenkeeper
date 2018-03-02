const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const deleteBranches = require('../../lib/delete-branches')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

afterAll(async () => {
  const { installations, repositories } = await dbs()
  await Promise.all([
    removeIfExists(installations, '123', '123_monorepo'),
    removeIfExists(repositories, '41:branch:deadbeef', '42:branch:deadbeef0', '42:branch:deadbeef1',
  '42_monorepo:branch:deadbeef1:older', '42_monorepo:branch:deadbeef1:same', '42_monorepo:branch:deadbeef1:newer',
  '42_monorepo:branch:deadbeef2:older', '42_monorepo:branch:deadbeef2:same', '42_monorepo:branch:deadbeef2:newer')
  ])
})

test('delete-branches', async () => {
  expect.assertions(5)

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
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper-standard-10.0.0')
    .reply(200, () => {
      // deleted 10.0.0
      expect(true).toBeTruthy()
      return {}
    })
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper-standard-9.0.0')
    .reply(200, () => {
      // deleted 9.0.0
      expect(true).toBeTruthy()
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

  expect(branch.referenceDeleted).toBeTruthy()
  expect(older.referenceDeleted).toBeTruthy()
  expect(newer.referenceDeleted).toBeFalsy()
})

test('delete-branches in monorepo', async () => {
  expect.assertions(8)

  const { installations, repositories } = await dbs()

  await Promise.all([
    installations.put({
      _id: '123_monorepo',
      installation: 22
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef1:older',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/backend/standard-9.0.0',
      dependency: 'standard',
      version: '9.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef1:same',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/backend/standard-10.0.0',
      dependency: 'standard',
      version: '10.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef1:newer',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/backend/standard-11.0.0',
      dependency: 'standard',
      version: '11.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef2:older',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/frontend/standard-9.0.0',
      dependency: 'standard',
      version: '9.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef2:same',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/frontend/standard-10.0.0',
      dependency: 'standard',
      version: '10.0.0',
      dependencyType: 'dependencies'
    }),
    repositories.put({
      _id: '42_monorepo:branch:deadbeef2:newer',
      type: 'branch',
      repositoryId: '42_monorepo',
      head: 'greenkeeper/frontend/standard-11.0.0',
      dependency: 'standard',
      version: '11.0.0',
      dependencyType: 'dependencies'
    })
  ])

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper/frontend/standard-10.0.0')
    .reply(200, () => {
      // deleted 10.0.0
      expect(true).toBeTruthy()
      return {}
    })
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper/frontend/standard-9.0.0')
    .reply(200, () => {
      // deleted 9.0.0
      expect(true).toBeTruthy()
      return {}
    })
    .delete('/repos/brot/lecker/git/refs/heads/greenkeeper/backend/standard-9.0.0')
    .reply(200, () => {
      // should not delete this one
      expect(true).toBeFalsy()
      return {}
    })

  await deleteBranches(
    { installationId: '123', fullName: 'brot/lecker', repositoryId: '42_monorepo' },
    {
      change: 'modified',
      after: '^10.0.0',
      dependency: 'standard',
      dependencyType: 'dependencies',
      groupName: 'frontend'
    }
  )

  const [notdeleted1, notdeleted2, notdeleted3] = await Promise.all([
    repositories.get('42_monorepo:branch:deadbeef1:older'),
    repositories.get('42_monorepo:branch:deadbeef1:same'),
    repositories.get('42_monorepo:branch:deadbeef1:newer')
  ])
  const [branch, older, newer] = await Promise.all([
    repositories.get('42_monorepo:branch:deadbeef2:same'),
    repositories.get('42_monorepo:branch:deadbeef2:older'),
    repositories.get('42_monorepo:branch:deadbeef2:newer')
  ])

  expect(notdeleted1.referenceDeleted).toBeFalsy()
  expect(notdeleted2.referenceDeleted).toBeFalsy()
  expect(notdeleted3.referenceDeleted).toBeFalsy()
  expect(branch.referenceDeleted).toBeTruthy()
  expect(older.referenceDeleted).toBeTruthy()
  expect(newer.referenceDeleted).toBeFalsy()
})
