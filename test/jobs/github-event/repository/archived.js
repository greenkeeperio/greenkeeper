const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists')

beforeEach(() => {
  jest.resetModules()
})

afterAll(async () => {
  const { repositories } = await dbs()
  await removeIfExists(repositories, 'publicRepoToBeArchived', 'privateRepoToBeArchived')
})

test('github-event public repository archived', async () => {
  const repoArchived = require('../../../../jobs/github-event/repository/archived')
  const { repositories } = await dbs()

  await repositories.put({
    _id: 'publicRepoToBeArchived',
    enabled: true,
    private: false,
    accountId: 'greebles'
  })

  const newJob = await repoArchived({
    repository: {
      id: 'publicRepoToBeArchived',
      full_name: 'test/test',
      owner: {
        id: 1234
      },
      private: false
    }
  })

  expect(newJob).toBeFalsy()
  const repo = await repositories.get('publicRepoToBeArchived')

  expect(repo.enabled).toBeFalsy()
  expect(repo.archived).toBeTruthy()
})

test('github-event private repository archived', async () => {
  jest.mock('../../../../lib/payments', () => {
    const payments = require.requireActual('../../../../lib/payments')
    payments.maybeUpdatePaymentsJob = async () => {
      // pretend this is a private repo with stripe payment
      return Promise.resolve({
        data: {
          name: 'update-payments',
          accountId: 'muppets'
        }
      })
    }
    return payments
  })
  const repoArchived = require('../../../../jobs/github-event/repository/archived')
  const { repositories } = await dbs()

  await repositories.put({
    _id: 'privateRepoToBeArchived',
    enabled: true,
    private: true,
    accountId: 'muppets'
  })

  const newJob = await repoArchived({
    repository: {
      id: 'privateRepoToBeArchived',
      full_name: 'test/test',
      owner: {
        id: 1234
      },
      private: true
    }
  })

  expect(newJob).toBeTruthy()
  const repo = await repositories.get('privateRepoToBeArchived')

  expect(repo.enabled).toBeFalsy()
  expect(repo.archived).toBeTruthy()
})
