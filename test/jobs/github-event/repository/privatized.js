const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists')

beforeEach(() => {
  jest.resetModules()
})

afterAll(async () => {
  const { repositories } = await dbs()
  await removeIfExists(repositories, 'publicRepoToBePrivatized')
})

test('github-event public repository privatized with stripe account', async () => {
  const repoPrivatized = require('../../../../jobs/github-event/repository/privatized')
  const { repositories } = await dbs()

  await repositories.put({
    _id: 'publicRepoToBePrivatized',
    enabled: true,
    private: false,
    accountId: 'mumble'
  })

  jest.mock('../../../../lib/payments', () => {
    const payments = require.requireActual('../../../../lib/payments')
    payments.maybeUpdatePaymentsJob = async () => {
      // pretend this is a private repo with stripe payment
      return Promise.resolve({
        data: {
          name: 'update-payments',
          accountId: 'mumble'
        }
      })
    }
    return payments
  })
  const newJob = await repoPrivatized({
    repository: {
      id: 'publicRepoToBePrivatized',
      full_name: 'mumble/bumble',
      owner: {
        id: 1234
      },
      private: true
    }
  })

  // update-payment job
  expect(newJob).toBeTruthy()
  const repo = await repositories.get('publicRepoToBePrivatized')
  expect(repo.enabled).toBeFalsy()
  expect(repo.private).toBeTruthy()
})

test('github-event public repository privatized without stripe account', async () => {
  const repoPrivatized = require('../../../../jobs/github-event/repository/privatized')
  const { repositories } = await dbs()

  await repositories.put({
    _id: 'publicRepoToBePrivatizedNoStripe',
    enabled: true,
    private: false,
    accountId: 'mumble'
  })

  jest.mock('../../../../lib/payments', () => {
    const payments = require.requireActual('../../../../lib/payments')
    payments.maybeUpdatePaymentsJob = async () => {
      return Promise.resolve({
        data: {
          name: 'payment-required',
          accountId: 'mumble',
          repositoryId: 'elbmum'
        }
      })
    }
    return payments
  })
  const newJob = await repoPrivatized({
    repository: {
      id: 'publicRepoToBePrivatizedNoStripe',
      full_name: 'mumble/bumble',
      owner: {
        id: 1234
      },
      private: true
    }
  })

  // update-payment job
  expect(newJob).toBeTruthy()
  const repo = await repositories.get('publicRepoToBePrivatizedNoStripe')
  expect(repo.enabled).toBeFalsy()
  expect(repo.private).toBeTruthy()
})
