const dbs = require('../../lib/dbs')

const {
  getMonorepoGroup,
  isPartOfMonorepo
} = require('../../lib/monorepo')

describe('lib monorepo', async () => {
  beforeEach(() => {
    jest.setTimeout(10000)
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('isPartOfMonorepo true', () => {
    jest.mock('../../lib/monorepo', () => {
      const lib = require.requireActual('../../lib/monorepo')
      lib.getMonorepoGroup = (dep) => {
        return 'fruits'
      }
      return lib
    })

    const libMonorepo = require.requireMock('../../lib/monorepo')
    const isPartOfMonorepo = libMonorepo.isPartOfMonorepo('@avocado/dep')
    expect(isPartOfMonorepo).toBeTruthy()
  })

  test('isPartOfMonorepo false', () => {
    const result = isPartOfMonorepo('some-dep')
    expect(result).toBeFalsy()
  })

  test('hasAllMonorepoUdates true', async () => {
    const { npm } = await dbs()
    await npm.put({
      _id: '@avocado/dep',
      distTags: {
        latest: '2.0.0'
      }
    })

    await npm.put({
      _id: '@banana/dep',
      distTags: {
        latest: '2.0.0'
      }
    })

    jest.mock('../../utils/monorepo-definitions', () => {
      const lib = require.requireActual('../../utils/monorepo-definitions')
      lib.monorepoDefinitions = { 'fruits': ['@avocado/dep', '@banana/dep'] }
      return lib
    })
    jest.mock('../../lib/monorepo', () => {
      const lib = require.requireActual('../../lib/monorepo')
      lib.getMonorepoGroup = (dep) => {
        return 'fruits'
      }
      return lib
    })

    const libMonorepo = require.requireMock('../../lib/monorepo')
    const result = await libMonorepo.hasAllMonorepoUdates('@avocado/dep', '2.0.0')
    expect(result).toBeTruthy()
  })

  test('hasAllMonorepoUdates false', async () => {
    const { npm } = await dbs()
    await npm.put({
      _id: 'berlin',
      distTags: {
        latest: '2.0.0'
      }
    })

    await npm.put({
      _id: 'koeln',
      distTags: {
        latest: '2.0.0'
      }
    })

    await npm.put({
      _id: 'hamburg',
      distTags: {
        latest: '1.0.0'
      }
    })

    jest.mock('../../utils/monorepo-definitions', () => {
      const lib = require.requireActual('../../utils/monorepo-definitions')
      lib.monorepoDefinitions = { 'cities': ['koeln', 'hamburg', 'berlin'] }
      return lib
    })
    jest.mock('../../lib/monorepo', () => {
      const lib = require.requireActual('../../lib/monorepo')
      lib.getMonorepoGroup = (dep) => {
        return 'cities'
      }
      lib.monorepoDefinitions = { 'cities': ['koeln', 'hamburg', 'berlin'] }
      return lib
    })

    const libMonorepo = require.requireMock('../../lib/monorepo')
    const result = await libMonorepo.hasAllMonorepoUdates('berlin', '2.0.0')
    expect(result).toBeFalsy()
  })

  test('getMonorepoGroup', () => {
    const result = getMonorepoGroup('pouchdb-md5')
    expect(result).toBe('pouchdb')
  })
})
