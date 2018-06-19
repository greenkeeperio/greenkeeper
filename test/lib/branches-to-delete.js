const dbs = require('../../lib/dbs')
const {
  getDependencyChanges,
  getDependencyBranchesToDelete,
  getGroupBranchesToDelete
} = require('../../lib/branches-to-delete')
const removeIfExists = require('../helpers/remove-if-exists')

beforeAll(async () => {
  const { installations } = await dbs()

  installations.put({
    _id: '123',
    installation: 37
  })
})

afterAll(async () => {
  const { installations, repositories } = await dbs()
  await Promise.all([
    removeIfExists(installations, '123'),
    removeIfExists(repositories, '332244:branch:deadbeef', '332244:branch:deadbeef0', '332244:branch:deadbeef1',
      '774422:branch:deadbeef', '774422:branch:deadbeef0', '774422:branch:deadbeef1',
      '1928:branch:deadbeef', '1928:branch:deadbeef0', '1928:branch:deadbeef1',
      '1929:branch:deadbeef', '1929:branch:deadbeef0', '1929:branch:deadbeef1'
    )
  ])
})

describe('getDependencyChanges', () => {
  test('no change', () => {
    const changes = {}

    expect(getDependencyChanges(changes)).toEqual([])
  })
  test('modified', () => {
    const changes = {
      dependencies: {
        lodash: {
          change: 'modified',
          before: '^1.0.0',
          after: '^2.0.0'
        }
      }
    }

    expect(getDependencyChanges(changes)).toEqual([
      {
        'after': '^2.0.0',
        'before': '^1.0.0',
        'change': 'modified',
        'dependency': 'lodash',
        'dependencyType': 'dependencies'
      }
    ])
  })
})

describe('getDependencyBranchesToDelete', () => {
  const config = { branchPrefix: 'greenkeeper/' }
  test('not a monorepo', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '332244:branch:deadbeef0',
        type: 'branch',
        repositoryId: '332244',
        head: 'greenkeeper/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '332244:branch:deadbeef',
        type: 'branch',
        repositoryId: '332244',
        head: 'greenkeeper/standard-10.0.0',
        dependency: 'standard',
        version: '10.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '332244:branch:deadbeef1',
        type: 'branch',
        repositoryId: '332244',
        head: 'greenkeeper/standard-11.0.0',
        dependency: 'standard',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getDependencyBranchesToDelete(
      {
        repositoryId: '332244',
        changes: {
          dependencies: {
            standard: {
              change: 'modified',
              before: '^8.0.0',
              after: '^10.0.0',
              groupName: null } } },
        repositories,
        config
      }
    )

    expect(branches).toHaveLength(2)
    expect(branches.map(branch => branch.version)).toEqual(['10.0.0', '9.0.0'])
  })
  test('monorepo dependency release', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '33224477:branch:beebfoot0',
        type: 'branch',
        repositoryId: '33224477',
        head: 'greenkeeper/pouchdb-core-9.0.0',
        dependency: 'pouchdb-core',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '33224477:branch:beebfoot1',
        type: 'branch',
        repositoryId: '33224477',
        head: 'greenkeeper/pouchdb-core-10.0.0',
        dependency: 'pouchdb-core',
        version: '10.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '33224477:branch:beebfoot2',
        type: 'branch',
        repositoryId: '33224477',
        head: 'greenkeeper/monorepo.pouchdb-11.0.0',
        dependency: 'pouchdb-mapreduce',
        monorepoGroupName: 'pouchdb',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getDependencyBranchesToDelete(
      {
        repositoryId: '33224477',
        changes: {
          dependencies: {
            'pouchdb-core': {
              change: 'modified',
              before: '^8.0.0',
              after: '^11.0.0',
              groupName: null,
              monorepoGroupName: 'pouchdb'
            } } },
        repositories,
        config
      }
    )

    expect(branches).toHaveLength(3)
  })
  test('monorepo', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '774422:branch:deadbeef0',
        type: 'branch',
        repositoryId: '774422',
        head: 'greenkeeper/backend/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '774422:branch:deadbeef',
        type: 'branch',
        repositoryId: '774422',
        head: 'greenkeeper/frontend/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '774422:branch:deadbeef1',
        type: 'branch',
        repositoryId: '774422',
        head: 'greenkeeper/frontend/standard-11.0.0',
        dependency: 'standard',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getDependencyBranchesToDelete(
      {
        repositoryId: '774422',
        changes: {
          dependencies: {
            standard: {
              change: 'modified',
              before: '^8.0.0',
              after: '^10.0.0',
              groupName: 'frontend' } } },
        repositories,
        config
      }
    )

    expect(branches).toHaveLength(1)
    expect(branches[0].head).toEqual('greenkeeper/frontend/standard-9.0.0')
  })
  test('monorepo dependency release for monorepo', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '77331177:branch:beebfoot0',
        type: 'branch',
        repositoryId: '77331177',
        head: 'greenkeeper/skateboard/pouchdb-core-9.0.0',
        dependency: 'pouchdb-core',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '77331177:branch:beebfoot1',
        type: 'branch',
        repositoryId: '77331177',
        head: 'greenkeeper/hulahoop/pouchdb-core-10.0.0',
        dependency: 'pouchdb-core',
        version: '10.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '77331177:branch:beebfoot2',
        type: 'branch',
        repositoryId: '77331177',
        head: 'greenkeeper/hulahoop/monorepo.pouchdb-11.0.0',
        dependency: 'pouchdb-mapreduce',
        monorepoGroupName: 'pouchdb',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getDependencyBranchesToDelete(
      {
        repositoryId: '77331177',
        changes: {
          dependencies: {
            'pouchdb-core': {
              change: 'modified',
              before: '^8.0.0',
              after: '^11.0.0',
              groupName: 'hulahoop',
              monorepoGroupName: 'pouchdb'} } },
        repositories,
        config
      }
    )

    expect(branches).toHaveLength(2)
    expect(branches[0].head).toEqual('greenkeeper/hulahoop/monorepo.pouchdb-11.0.0')
    expect(branches[1].head).toEqual('greenkeeper/hulahoop/pouchdb-core-10.0.0')
  })
})

describe('getGroupBranchesToDelete', () => {
  const configChanges = { added: [], modified: [], removed: ['frontend'] }

  test('there are no group branches for that group', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '1928:branch:deadbeef0',
        type: 'branch',
        repositoryId: '1928',
        head: 'greenkeeper/backend/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '1928:branch:deadbeef',
        type: 'branch',
        repositoryId: '1928',
        head: 'greenkeeper/mobile/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '1928:branch:deadbeef1',
        type: 'branch',
        repositoryId: '1928',
        head: 'greenkeeper/mobile/standard-11.0.0',
        dependency: 'standard',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getGroupBranchesToDelete({ repositories, repositoryId: '1928', configChanges })
    expect(branches[0]).toHaveLength(0)
  })
  test('get group branches', async () => {
    const { repositories } = await dbs()

    await Promise.all([
      repositories.put({
        _id: '1929:branch:deadbeef0',
        type: 'branch',
        repositoryId: '1929',
        head: 'greenkeeper/backend/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '1929:branch:deadbeef',
        type: 'branch',
        repositoryId: '1929',
        head: 'greenkeeper/frontend/standard-9.0.0',
        dependency: 'standard',
        version: '9.0.0',
        dependencyType: 'dependencies'
      }),
      repositories.put({
        _id: '1929:branch:deadbeef1',
        type: 'branch',
        repositoryId: '1929',
        head: 'greenkeeper/frontend/standard-11.0.0',
        dependency: 'standard',
        version: '11.0.0',
        dependencyType: 'dependencies'
      })
    ])

    const branches = await getGroupBranchesToDelete({ repositories, repositoryId: '1929', configChanges })
    expect(branches[0]).toHaveLength(2)
    expect(branches[0][0].head).toMatch(/frontend/)
    expect(branches[0][1].head).toMatch(/frontend/)
  })
})
