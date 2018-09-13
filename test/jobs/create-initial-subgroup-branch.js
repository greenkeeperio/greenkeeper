const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create initial subgroup branch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
    nock.cleanAll()
  })

  beforeAll(async () => {
    const { installations } = await dbs()

    await installations.put({
      _id: '123',
      installation: 37,
      plan: 'free'
    })
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(repositories, '1111', '1111:branch:1234abcd', '1112', '1112:branch:1234abcd', 'initialSubgroupBranch3', 'initialSubgroupBranch3:branch:1234abcd', '1111-lockfiles', '1111-lockfiles:branch:1234abcd')
    ])
  })

  test('create a subgroup branch', async () => {
    const { repositories } = await dbs()
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }
    await repositories.put({
      _id: '1111',
      fullName: 'hans/monorepo',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/backend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/lalalalala/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    expect.assertions(9)

    const httpRequests = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })

    const npmHttpRequests = nock('https://registry.npmjs.org')
      .get('/lodash')
      .reply(200, {
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
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms.forEach(t => {
        const newPkg = JSON.parse(
          t.transform(JSON.stringify({ dependencies: { lodash: '^1.0.0' } }))
        )
        expect(newPkg.dependencies['lodash']).toEqual('^2.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: '1111', groupName: 'frontend'})
    const newBranch = await repositories.get('1111:branch:1234abcd')

    expect(httpRequests.isDone()).toBeTruthy()
    expect(npmHttpRequests.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy() // This only creates branches
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.subgroupInitial).toBeTruthy()
    expect(newBranch.repositoryId).toEqual('1111')
  })

  test('create a subgroup branch, with existing initial subgroub branch', async () => {
    const { repositories } = await dbs()
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }
    await repositories.put({
      _id: '11112',
      fullName: 'hans/monorepo',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/backend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/lalalalala/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })
    await repositories.put({
      _id: '11112:branch:initialGroup',
      type: 'branch',
      sha: '1234abcd',
      repositoryId: '11112',
      head: 'greenkeeper/initial-frontend',
      initial: false,
      subgroupInitial: true,
      group: 'frontend'
    })

    expect.assertions(10)

    const httpRequests = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })
      .delete('/repos/hans/monorepo/git/refs/heads/greenkeeper/initial-frontend')
      .reply(200, {})

    const npmHttpRequests = nock('https://registry.npmjs.org')
      .get('/lodash')
      .reply(200, {
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
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms.forEach(t => {
        const newPkg = JSON.parse(
          t.transform(JSON.stringify({ dependencies: { lodash: '^1.0.0' } }))
        )
        expect(newPkg.dependencies['lodash']).toEqual('^2.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: '11112', groupName: 'frontend'})
    const oldBranch = await repositories.get('11112:branch:initialGroup')
    expect(oldBranch.referenceDeleted).toBeTruthy()
    const newBranch = await repositories.get('11112:branch:1234abcd')

    expect(httpRequests.isDone()).toBeTruthy()
    expect(npmHttpRequests.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy() // This only creates branches
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.subgroupInitial).toBeTruthy()
    expect(newBranch.repositoryId).toEqual('11112')
  })

  test('create a subgroup branch with all dependencies ignored from multiple sources', async () => {
    const { repositories } = await dbs()
    const configFileContent = {
      ignore: ['eslint', 'lodash'],
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ],
          ignore: ['standard']
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }
    await repositories.put({
      _id: '1112',
      fullName: 'hans/monorepo',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0',
            eslint: '^1.0.0',
            standard: '^1.0.0'
          }
        },
        'packages/backend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/lalalalala/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const httpRequests = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0',
            eslint: '^1.0.0',
            standard: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })

    const npmHttpRequests = nock('https://registry.npmjs.org')
      .get('/lodash')
      .reply(200, {
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
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms.forEach(t => {
        const newPkg = JSON.parse(
          t.transform(JSON.stringify({ dependencies: { lodash: '^1.0.0' } }))
        )
        expect(newPkg.dependencies['lodash']).toEqual('^1.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: 1112, groupName: 'frontend'})
    // All deps are ignored, so no new branch!
    // Syntax for expecting throws on async/await: https://facebook.github.io/jest/docs/en/expect.html#rejects
    await expect(repositories.get('1112:branch:1234abcd')).rejects.toThrow('missing')
    expect(httpRequests.isDone()).toBeTruthy()
    expect(npmHttpRequests.isDone()).toBeFalsy() // all deps are ignored, so no npm requests should be made
    expect(newJob).toBeFalsy() // Nothing should happen
  })

  test('create a subgroup branch with a new group and one non-existing package.json in greenkeeper.json', async () => {
    const { repositories } = await dbs()
    const configFileContent = {
      groups: {
        backend: {
          packages: [
            'packages/package.json'
          ]
        },
        frontend: {
          packages: [
            'packages/non-existing/package.json',
            'packages/existing/package.json'
          ]
        }
      }
    }

    await repositories.put({
      _id: 'initialSubgroupBranch3',
      fullName: 'hans/monorepo',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/package.json': {
          name: 'testpkg',
          dependencies: {
            eslint: '^1.0.0'
          }
        },
        'packages/existing/package.json': {
          name: 'testpkg',
          dependencies: {
            eslint: '^1.0.0'
          }
        },
        'packages/non-existing/package.json': {
          name: 'testpkg',
          dependencies: {
            eslint: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent
    })

    const httpRequests = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/package.json')
      .reply(200, {
        path: 'packages/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            eslint: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/non-existing/package.json')
      .reply(404)
      .get('/repos/hans/monorepo/contents/packages/existing/package.json')
      .reply(200, {
        path: 'packages/existing/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            eslint: '^1.0.0'
          }
        })
      })

    const npmHttpRequests = nock('https://registry.npmjs.org')
      .get('/eslint')
      .reply(200, {
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
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms.forEach(t => {
        const newPkg = JSON.parse(
          t.transform(JSON.stringify({ dependencies: { eslint: '^1.0.0' } }))
        )
        expect(newPkg.dependencies['eslint']).toEqual('^2.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: 'initialSubgroupBranch3', groupName: 'frontend'})
    const newBranch = await repositories.get('initialSubgroupBranch3:branch:1234abcd')

    expect(httpRequests.isDone()).toBeTruthy()
    expect(npmHttpRequests.isDone()).toBeTruthy()

    expect(newJob).toBeFalsy() // This only creates branches

    expect(newBranch).toBeTruthy()
    expect(newBranch.depsUpdated).toBeTruthy()
    expect(newBranch.initial).toBeFalsy()
  })

  test('create no subgroup branch because of too many package.jsons', async () => {
    const huuuuuugeMonorepo = {}
    for (let i = 0; i <= 333; i++) {
      huuuuuugeMonorepo[i] = (i + '/package.json')
    }

    const { repositories } = await dbs()
    await repositories.put({
      _id: 'to-many-packages',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      fullName: 'finnp/test',
      packages: huuuuuugeMonorepo
    })

    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: 'to-many-packages'})

    expect(newJob).toBeFalsy()
  })

  test('create a subgroup branch with lockfiles', async () => {
    const { repositories } = await dbs()
    const configFileContent = {
      groups: {
        frontend: {
          packages: [
            'packages/frontend/package.json',
            'packages/lalalalala/package.json'
          ]
        },
        backend: {
          packages: [
            'packages/backend/package.json'
          ]
        }
      }
    }
    await repositories.put({
      _id: '1111-lockfiles',
      fullName: 'hans/monorepo',
      accountId: '123',
      enabled: true,
      headSha: 'hallo',
      packages: {
        'packages/frontend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/backend/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        },
        'packages/lalalalala/package.json': {
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        }
      },
      greenkeeper: configFileContent,
      files: {
        'package.json': ['frontend/package.json', 'backend/package.json', 'lalalalala/package.json'],
        'package-lock.json': ['frontend/package-lock.json', 'backend/package-lock.json', 'lalalalala/package-lock.json'],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      }
    })

    expect.assertions(11)

    const httpRequests = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
      })
      .get('/repos/hans/monorepo/contents/packages/frontend/package.json')
      .reply(200, {
        path: 'packages/frontend/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo/contents/packages/lalalalala/package.json')
      .reply(200, {
        path: 'packages/lalalalala/package.json',
        name: 'package.json',
        content: encodePkg({
          name: 'testpkg',
          dependencies: {
            lodash: '^1.0.0'
          }
        })
      })
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })

    const npmHttpRequests = nock('https://registry.npmjs.org')
      .get('/lodash')
      .reply(200, {
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
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms, processLockfiles, repoDoc }) => {
      expect(processLockfiles).toBeTruthy()
      expect(repoDoc).toHaveProperty('files')
      transforms.forEach(t => {
        const newPkg = JSON.parse(
          t.transform(JSON.stringify({ dependencies: { lodash: '^1.0.0' } }))
        )
        expect(newPkg.dependencies['lodash']).toEqual('^2.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')
    const newJob = await createInitialSubgroupBranch({repositoryId: '1111-lockfiles', groupName: 'frontend'})
    const newBranch = await repositories.get('1111-lockfiles:branch:1234abcd')

    expect(httpRequests.isDone()).toBeTruthy()
    expect(npmHttpRequests.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy() // This only creates branches
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.subgroupInitial).toBeTruthy()
    expect(newBranch.repositoryId).toEqual('1111-lockfiles')
  })
  function encodePkg (pkg) {
    return Buffer.from(JSON.stringify(pkg)).toString('base64')
  }
})
