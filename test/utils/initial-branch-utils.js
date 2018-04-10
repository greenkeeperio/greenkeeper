const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

describe('create initial branch', () => {
  beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    delete process.env.BADGES_HOST
    cleanCache('../../lib/env')
    jest.resetModules()
  })

  beforeAll(async () => {
    const { installations, payments } = await dbs()

    await installations.put({
      _id: '123',
      installation: 137,
      plan: 'free'
    })

    await payments.put({
      _id: '123',
      stripeSubscriptionId: 'stripe123',
      plan: 'personal'
    })
  })

  afterAll(async () => {
    const { installations, repositories, payments } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(payments, '123'),
      removeIfExists(repositories, '42', '43', '44', '45', '46', '47', '48', '49', '42:branch:1234abcd', '47:branch:1234abcd', '48:branch:1234abcd', '49:branch:1234abcd')
    ])
  })

  test('create pull request for monorepo with one non-root package.json', async () => {
    const ignore = ['eslint', 'lodash']
    const packagePaths = ['package.json', 'frontend/package.json']
    const packageJsonContents = [{ devDependencies: {'@finnpauls/dep': '1.0.0'} }]
    const registryGet = () => {}
    // const log = {
    //   info: () => {}
    // }
    const log = console

    const { repositories } = await dbs()
    await repositories.put({
      _id: '49',
      accountId: '123',
      fullName: 'finnp/test'
    })

    // mock relative dependencies
    jest.mock('../../utils/initial-branch-utils', () => {
      const utils = require.requireActual('../../utils/initial-branch-utils')
      utils.addNPMPackageData = async(dependencyInfo, registryGet, log) => {
        return [{
          name: '@finnpauls/dep',
          version: '1.0.0',
          type: 'devDependencies',
          data: {
            'dist-tags': {
              latest: '3.0.0-rc1'
            },
            versions: {
              '2.0.0-rc1': true,
              '2.0.0-rc2': true,
              '2.0.0': true,
              '3.0.0-rc1': true,
              '1.0.0': true
            }
          }
        }]
      }
      utils.getDependenciesFromPackageFiles = (packagePaths, packageJsonContents) => {
        return [{
          name: '@finnpauls/dep',
          version: '1.0.0',
          type: 'devDependencies'
        }]
      }
      return utils
    })
    const initialBranchUtils = require.requireMock('../../utils/initial-branch-utils')
    const updatedDependencies = await initialBranchUtils.getUpdatedDependenciesForFiles({ignore, log, packagePaths, packageJsonContents, registryGet})
    expect(updatedDependencies[0].newVersion).toEqual('2.0.0')
  })
})
