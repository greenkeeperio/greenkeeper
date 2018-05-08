// const dbs = require('../../lib/dbs')
// const {
//   isPartOfMonorepo,
//   hasAllMonorepoUdates,
//   getMonorepoGroup } = require('../../lib/monorepo')
// const { npm } = await dbs()
// await npm.put({
//   _id: '49',
//   accountId: '123',
//   fullName: 'finnp/test'
// })
const simple = require('simple-mock')

describe('lib monorepo', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('isPartOfMonorepo true', () => {
    const {isPartOfMonorepo, getMonorepoGroup} = require('../../lib/monorepo')
    simple.mock(getMonorepoGroup, 'getMonorepoGroup').resolveWith(['@avocado/dep', '@banana/dep'])
    simple.mock(isPartOfMonorepo, 'isPartOfMonorepo').callOriginal('@avocado/dep')
    const result = isPartOfMonorepo('@avocado/dep')
    simple.restore()

    console.log('### result', result)
    expect(result).toBeTruthy()

    // jest.mock('../../lib/monorepo', () => {
    //   console.log('### mock')
    //   const lib = require.requireActual('../../lib/monorepo')
    //   lib.getMonorepoGroup = (dep) => {
    //     console.log('### dep', dep)
    //     return ['@avocado/dep', '@banana/dep']
    //   }
    //   console.log('### lib.isPartOfMonorepo(dep', lib.isPartOfMonorepo('dep/dep'))
    //   // lib.isPartOfMonorepo = (dependency) => {
    //   //   return !!lib.getMonorepoGroup(dependency)
    //   // }
    //   return lib
    // })
    // const libMonorepo = require.requireMock('../../lib/monorepo')
    //
    // const isPartOfMonorepo = libMonorepo.isPartOfMonorepo('@avocado/dep')
    // console.log('### isPartOfMonorepo', isPartOfMonorepo)
    // expect(isPartOfMonorepo).toBeTruthy()
  })

  test.skip('getMonorepoGroup', () => {
    const {getMonorepoGroup} = require('../../lib/monorepo')

    const monorepoGroup = getMonorepoGroup('pouchdb')
    console.log('### libMonorepo.getMonorepoGroup()', getMonorepoGroup('pouchdb'))
    console.log('### monorepoGroup', monorepoGroup)
    expect(monorepoGroup).toBeTruthy()
  })
})
