const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
// const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create initial subgroup branch', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  beforeAll(async () => {
    const { installations } = await dbs()

    await installations.put({
      _id: '123',
      installation: 37,
      plan: 'free'
    })
  })

  test('create a subgroup pull request', async () => {
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

    // expect.assertions(10)

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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

    nock('https://registry.npmjs.org')
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
        t.created = true
        expect(newPkg.dependencies['lodash']).toEqual('^2.0.0')
      })

      return '1234abcd'
    })
    const createInitialSubgroupBranch = require('../../jobs/create-initial-subgroup-branch')

    const newJob = await createInitialSubgroupBranch({repositoryId: 1111, groupName: 'frontend'})
    const newBranch = await repositories.get('1111:branch:1234abcd')

    expect(newJob).toBeFalsy()
    expect(newBranch.type).toEqual('branch')
    // expect(newBranch.initial).toBeTruthy()
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(repositories, '1111', '1111:branch:1234abcd')
    ])
  })

  function encodePkg (pkg) {
    return Buffer.from(JSON.stringify(pkg)).toString('base64')
  }
})
