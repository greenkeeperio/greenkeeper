const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create initial branch', () => {
  beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    delete process.env.BADGES_HOST
    cleanCache('../../lib/env')
    jest.resetModules()
  })

  beforeAll(async () => {
    jest.setTimeout(20000)
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
      removeIfExists(repositories, '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '42:branch:1234abcd', '47:branch:1234abcd', '48:branch:1234abcd', '49:branch:1234abcd', '50:branch:1234abcd', '51:branch:1234abcd')
    ])
  })

  test('create pull request', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '42',
      accountId: '123',
      fullName: 'finnp/test'
    })
    const devDependencies = {
      '@finnpauls/dep': '1.0.0',
      '@finnpauls/dep2': '1.0.0'
    }
    expect.assertions(10)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/labels', {
        name: 'greenkeeper',
        color: '00c775'
      })
      .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep')
      .reply(200, {
        'dist-tags': {
          latest: '2.0.0'
        }
      })
      .get('/@finnpauls%2Fdep2')
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
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@finnpauls/dep': '1.0.0',
        '@finnpauls/dep2': '1.0.0'
      }

      const newPkg = JSON.parse(
        transforms[0].transform(JSON.stringify({ devDependencies }))
      )
      transforms[0].created = true
      expect(newPkg.devDependencies['@finnpauls/dep']).toEqual('2.0.0')
      expect(newPkg.devDependencies['@finnpauls/dep2']).toEqual('2.0.0')

      const newReadme = transforms[2].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/finnp\/test.svg/)

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 42})
    const newBranch = await repositories.get('42:branch:1234abcd')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(42)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
  })

  test('badge already added', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '44',
      accountId: '123',
      fullName: 'finnp/test'
    })

    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms[2].transform(
        'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.svg',
        'README.md'
      )
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({ who: 'cares' })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })

    const newJob = await createInitialBranch({repositoryId: 44})
    expect(newJob).toBeFalsy()
    const repodoc = await repositories.get('44')
    expect(repodoc.files['package.json']).not.toHaveLength(0)
    expect(repodoc.files['package-lock.json']).not.toHaveLength(0)
    expect(repodoc.files['yarn.lock']).toHaveLength(0)
    expect(repodoc.enabled).toBeTruthy()
  })

  test('badge already added for private repo', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '45',
      accountId: '123',
      fullName: 'finnp/test',
      private: true
    })

    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms[2].transform(
        'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.svg',
        'README.md'
      )
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({ who: 'cares' })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })

    const newJob = await createInitialBranch({repositoryId: 45})

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('update-payments')
    expect(newJob.data.accountId).toEqual('123')
  })

  test('badge already added for private repo within GKE', async () => {
    process.env.IS_ENTERPRISE = true
    const { repositories } = await dbs()

    await repositories.put({
      _id: '46',
      accountId: '123',
      fullName: 'finnp/test',
      private: true
    })

    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms[2].transform(
        'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.svg',
        'README.md'
      )
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        name: 'package-lock.json',
        content: encodePkg({ who: 'cares' })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })

    const newJob = await createInitialBranch({repositoryId: 46})
    expect(newJob).toBeFalsy()
  })

  test('ignore forks without issues enabled', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '43',
      accountId: '123',
      fullName: 'finnp/test2',
      fork: true,
      hasIssues: false
    })
    expect.assertions(2)

    const createInitialBranch = require('../../jobs/create-initial-branch')

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})

    const newJob = await createInitialBranch({
      repositoryId: 43
    })
    expect(newJob).toBeFalsy()
    try {
      await repositories.get('43:branch:1234abcd')
    } catch (e) {
      // no pr created
      expect(true).toBeTruthy()
    }
  })

  /*
    Monorepo tests
  */
  test('create pull request for monorepo and add greenkeeper.json', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '47',
      accountId: '123',
      fullName: 'finnp/test'
    })
    const devDependencies = {
      '@finnpauls/dep': '1.0.0',
      '@finnpauls/dep2': '1.0.0'
    }
    expect.assertions(24)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      // first time from repository-docs.js -> updateRepoDoc
      .get('/repos/finnp/test/contents/greenkeeper.json')
      .reply(404, {
        message: 'Not Found'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          },
          {
            'path': 'frontend/package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test/contents/frontend/package.json')
      .reply(200, {
        path: 'frontend/package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/labels', {
        name: 'greenkeeper',
        color: '00c775'
      })
      .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep')
      .reply(200, {
        'dist-tags': {
          latest: '2.0.0'
        }
      })
      .get('/@finnpauls%2Fdep2')
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
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@finnpauls/dep': '1.0.0',
        '@finnpauls/dep2': '1.0.0'
      }

      // Update all the dependencies in the package.json files
      expect(transforms[0].create).toBeTruthy()
      expect(transforms[4].create).toBeTruthy()
      transforms.slice(1, 2).map((packageFile, index) => {
        const newPkg = JSON.parse(
          transforms[index + 1].transform(JSON.stringify({ devDependencies }))
        )
        expect(newPkg.devDependencies['@finnpauls/dep']).toEqual('2.0.0')
        expect(newPkg.devDependencies['@finnpauls/dep2']).toEqual('2.0.0')
      })

      const newReadme = transforms[4].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/finnp\/test.svg/)
      expect(transforms.length).toEqual(5)
      expect(transforms[0].path).toEqual('greenkeeper.json')
      expect(transforms[0].message).toEqual('chore: add Greenkeeper config file')
      const greenkeeperConfigTransformResult = transforms[0].transform()
      expect(JSON.parse(greenkeeperConfigTransformResult)).toEqual({
        groups: {
          default: {
            packages: ['package.json', 'frontend/package.json']
          }
        }
      })
      // greenkeeper.json must end with a newline
      expect(greenkeeperConfigTransformResult.substr(greenkeeperConfigTransformResult.length - 1, 1)).toEqual('\n')
      expect(transforms[1].path).toEqual('frontend/package.json')
      expect(JSON.parse(transforms[1].transform(JSON.stringify({ devDependencies })))).toEqual({
        'devDependencies': {
          '@finnpauls/dep': '2.0.0',
          '@finnpauls/dep2': '2.0.0'
        }
      })
      expect(transforms[2].path).toEqual('package.json')
      expect(JSON.parse(transforms[2].transform(JSON.stringify({ devDependencies })))).toEqual({
        'devDependencies': {
          '@finnpauls/dep': '2.0.0',
          '@finnpauls/dep2': '2.0.0'
        }
      })
      expect(transforms[3].path).toEqual('.travis.yml')
      expect(transforms[4].path).toEqual('README.md')

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 47})
    const newBranch = await repositories.get('47:branch:1234abcd')
    const repoDoc = await repositories.get('47')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(47)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
    expect(repoDoc.greenkeeper).toEqual({
      groups: {
        default: {
          packages: ['package.json', 'frontend/package.json']
        }
      }
    })
  })

  test('#677 PR message with no root package.json update', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '50',
      accountId: '123',
      fullName: 'finnp/test'
    })
    const devDependencies = {
      '@finnpauls/dep': '1.0.0',
      '@finnpauls/dep2': '1.0.0'
    }
    const rootDevDependencies = {
      '@finnpauls/dep': '2.0.0'
    }
    expect.assertions(23)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      // first time from repository-docs.js -> updateRepoDoc
      .get('/repos/finnp/test/contents/greenkeeper.json')
      .reply(404, {
        message: 'Not Found'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          },
          {
            'path': 'frontend/package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ rootDevDependencies })
      })
      .get('/repos/finnp/test/contents/frontend/package.json')
      .reply(200, {
        path: 'frontend/package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/labels', {
        name: 'greenkeeper',
        color: '00c775'
      })
      .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep')
      .reply(200, {
        'dist-tags': {
          latest: '2.0.0'
        }
      })
      .get('/@finnpauls%2Fdep2')
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
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@finnpauls/dep': '1.0.0',
        '@finnpauls/dep2': '1.0.0'
      }

      // Update all the dependencies in the package.json files
      const newPkg = JSON.parse(
        transforms[2].transform(JSON.stringify({ devDependencies }))
      )

      expect(newPkg.devDependencies['@finnpauls/dep']).toEqual('2.0.0')
      expect(newPkg.devDependencies['@finnpauls/dep2']).toEqual('2.0.0')

      const newReadme = transforms[4].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/finnp\/test.svg/)
      expect(transforms.length).toEqual(5)
      expect(transforms[0].path).toEqual('greenkeeper.json')
      expect(transforms[0].message).toEqual('chore: add Greenkeeper config file')
      const greenkeeperConfigTransformResult = transforms[0].transform()
      expect(JSON.parse(greenkeeperConfigTransformResult)).toEqual({
        groups: {
          default: {
            packages: ['package.json', 'frontend/package.json']
          }
        }
      })
      // greenkeeper.json must end with a newline
      expect(greenkeeperConfigTransformResult.substr(greenkeeperConfigTransformResult.length - 1, 1)).toEqual('\n')
      expect(transforms[1].path).toEqual('frontend/package.json')
      expect(JSON.parse(transforms[1].transform(JSON.stringify({ devDependencies })))).toEqual({
        'devDependencies': {
          '@finnpauls/dep': '2.0.0',
          '@finnpauls/dep2': '2.0.0'
        }
      })
      expect(transforms[2].path).toEqual('package.json')
      expect(JSON.parse(transforms[2].transform(JSON.stringify({ devDependencies })))).toEqual({
        'devDependencies': {
          '@finnpauls/dep': '2.0.0',
          '@finnpauls/dep2': '2.0.0'
        }
      })
      expect(transforms[3].path).toEqual('.travis.yml')
      expect(transforms[4].path).toEqual('README.md')

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 50})
    const newBranch = await repositories.get('50:branch:1234abcd')
    const repoDoc = await repositories.get('50')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(50)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
    expect(newBranch.depsUpdated).toBeTruthy()
    expect(repoDoc.greenkeeper).toEqual({
      groups: {
        default: {
          packages: ['package.json', 'frontend/package.json']
        }
      }
    })
  })

  test('create pull request for monorepo and update existing greenkeeper.json', async () => {
    // We also simulate that the greenkeeper.json info in our repoDoc is out of date and
    // should be overwritten with what is in the actual file on github.
    const githubConfigFileContent = {
      ignore: [
        'eslint'
      ],
      groups: {
        build: {
          packages: [
            'package.json'
          ]
        },
        frontend: {
          packages: [
            'frontend/package.json',
            'this-file-no-longer-exists/package.json'
          ]
        },
        backend: {
          packages: [
            'backend/package.json'
          ]
        },
        empty: {
          packages: [
            'this-whole-group-should-disappear/package.json'
          ]
        }
      }
    }
    const repoDocConfigFileContent = {
      ignore: [
        'eslint'
      ],
      groups: {
        build: {
          packages: [
            'package.json'
          ]
        },
        backend: {
          packages: [
            'backend/package.json'
          ]
        },
        empty: {
          packages: [
            'this-whole-group-should-disappear/package.json'
          ]
        }
      }
    }
    const { repositories } = await dbs()
    await repositories.put({
      _id: '48',
      accountId: '123',
      fullName: 'finnp/test',
      greenkeeper: repoDocConfigFileContent
    })
    const devDependencies = {
      '@finnpauls/dep': '1.0.0',
      '@finnpauls/dep2': '1.0.0'
    }

    expect.assertions(21)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      // first time from repository-docs.js -> updateRepoDoc
      .get('/repos/finnp/test/contents/greenkeeper.json')
      .reply(200, {
        type: 'file',
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(JSON.stringify(githubConfigFileContent)).toString('base64')
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          },
          {
            'path': 'frontend/package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          },
          {
            'path': 'backend/package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test/contents/frontend/package.json')
      .reply(200, {
        path: 'frontend/package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test/contents/backend/package.json')
      .reply(200, {
        path: 'backend/package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/labels', {
        name: 'greenkeeper',
        color: '00c775'
      })
      .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep')
      .reply(200, {
        'dist-tags': {
          latest: '2.0.0'
        }
      })
      .get('/@finnpauls%2Fdep2')
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
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@finnpauls/dep': '1.0.0',
        '@finnpauls/dep2': '1.0.0'
      }

      // Update all the dependencies in the package.json files
      transforms.slice(1, 3).map((packageFile, index) => {
        const newPkg = JSON.parse(
          transforms[index + 1].transform(JSON.stringify({ devDependencies }))
        )
        transforms[index + 1].created = true
        expect(newPkg.devDependencies['@finnpauls/dep']).toEqual('2.0.0')
        expect(newPkg.devDependencies['@finnpauls/dep2']).toEqual('2.0.0')
      })

      const newReadme = transforms[5].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/finnp\/test.svg/)
      expect(transforms[0].path).toBe('greenkeeper.json')
      // The `empty` group should disappear completely, since it no longer contains any files
      // The `frontend` group should not contain `this-file-no-longer-exists/package.json`, since that file
      // is no longer in the repo
      const transformedConfigFile = transforms[0].transform()
      const parsedConfigFile = JSON.parse(transformedConfigFile)
      // Check that we don’t add Greenkeeper system defaults to the actual greenkeeper.json file
      expect(parsedConfigFile.commitMessages).toBeFalsy()
      expect(parsedConfigFile.groups).toMatchObject({
        build: {
          packages: [
            'package.json'
          ]
        },
        frontend: {
          packages: [
            'frontend/package.json'
          ]
        },
        backend: {
          packages: [
            'backend/package.json'
          ]
        }
      })
      // greenkeeper.json must end with a newline
      expect(transformedConfigFile.substr(transformedConfigFile.length - 1, 1)).toEqual('\n')
      expect(transforms[0].message).toEqual('chore: update Greenkeeper config file')
      expect(parsedConfigFile.ignore).toEqual(['eslint'])
      expect(transforms.length).toEqual(6)

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 48})
    const newBranch = await repositories.get('48:branch:1234abcd')
    const repoDoc = await repositories.get('48')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(48)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
    expect(repoDoc.greenkeeper.groups).toMatchObject({
      build: {
        packages: [
          'package.json'
        ]
      },
      frontend: {
        packages: [
          'frontend/package.json'
        ]
      },
      backend: {
        packages: [
          'backend/package.json'
        ]
      }
    })
    expect(repoDoc.greenkeeper.ignore).toContain('eslint')
  })

  test('create pull request for monorepo with one non-root package.json', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '49',
      accountId: '123',
      fullName: 'finnp/test'
    })
    const devDependencies = {
      '@finnpauls/dep': '1.0.0',
      '@finnpauls/dep2': '1.0.0'
    }
    expect.assertions(13)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      // first time from repository-docs.js -> updateRepoDoc
      .get('/repos/finnp/test/contents/greenkeeper.json')
      .reply(404, {
        message: 'Not Found'
      })
      .get('/repos/finnp/test/git/trees/master?recursive=true')
      .reply(200, {
        tree: [
          {
            'path': 'frontend/package.json',
            'mode': '100644',
            'type': 'blob',
            'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
            'size': 1379,
            'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
          }
        ]
      })
      .get('/repos/finnp/test/contents/frontend/package.json')
      .reply(200, {
        path: 'frontend/package.json',
        name: 'package.json',
        content: encodePkg({ devDependencies })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/labels', {
        name: 'greenkeeper',
        color: '00c775'
      })
      .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep')
      .reply(200, {
        'dist-tags': {
          latest: '2.0.0'
        }
      })
      .get('/@finnpauls%2Fdep2')
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
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@finnpauls/dep': '1.0.0',
        '@finnpauls/dep2': '1.0.0'
      }

      const newPkg = JSON.parse(
        transforms[1].transform(JSON.stringify({ devDependencies }))
      )
      transforms[1].created = true
      expect(newPkg.devDependencies['@finnpauls/dep']).toEqual('2.0.0')
      expect(newPkg.devDependencies['@finnpauls/dep2']).toEqual('2.0.0')

      const newReadme = transforms[3].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/finnp\/test.svg/)

      expect(transforms[0].path).toBe('greenkeeper.json')
      expect(JSON.parse(transforms[0].transform())).toEqual({
        groups: {
          default: {
            packages: ['frontend/package.json']
          }
        }
      })

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 49})
    const newBranch = await repositories.get('49:branch:1234abcd')
    const repoDoc = await repositories.get('49')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(49)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
    expect(repoDoc.greenkeeper).toEqual({
      groups: {
        default: {
          packages: ['frontend/package.json']
        }
      }
    })
  })

  test('create invalid config issue on monorepo', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '51',
      accountId: '123',
      fullName: 'finnp/test'
    })

    const invalidJSONString = `{
      groups {
        '#invalid#groupname#': {
          packages: [
            '/package.json'
          ]
        }
      }
    }`
    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      // first time from repository-docs.js -> updateRepoDoc
      .get('/repos/finnp/test/contents/greenkeeper.json')
      .reply(200, {
        path: 'greenkeeper.json',
        name: 'greenkeeper.json',
        content: Buffer.from(invalidJSONString).toString('base64')
      })

    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 51})
    const repoDoc = await repositories.get('51')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('invalid-config-file')
    expect(newJob.data.repositoryId).toBe(51)
    expect(repoDoc.openInitialPRWhenConfigFileFixed).toBeTruthy()
  })

  // From https://github.com/greenkeeperio/greenkeeper/issues/733
  test('correctly ignore scoped package in initial PR', async () => {
    const { repositories } = await dbs()
    const packageJSON = {
      'name': 'firebase-configuration-schema',
      'devDependencies': {
        '@semantic-release/git': '2.0.0'
      },
      'greenkeeper': {
        'ignore': [
          '@semantic-release/git'
        ]
      }
    }
    await repositories.put({
      _id: '52',
      accountId: '123',
      fullName: 'espy/test'
    })

    expect.assertions(10)

    nock('https://api.github.com')
    .post('/installations/137/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/espy/test')
    .reply(200, {
      default_branch: 'master'
    })
    .get('/repos/espy/test/git/trees/master?recursive=true')
    .reply(200, {
      tree: [
        {
          'path': 'package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        }
      ]
    })
    .get('/repos/espy/test/contents/package.json')
    .reply(200, {
      path: 'package.json',
      name: 'package.json',
      content: encodePkg(packageJSON)
    })
    .get('/repos/espy/test')
    .reply(200, {
      default_branch: 'custom'
    })
    .post('/repos/espy/test/labels', {
      name: 'greenkeeper',
      color: '00c775'
    })
    .reply(201)

    nock('https://registry.npmjs.org')
      .get('/@semanticrelease%2Fgit')
      .reply(200, {
        'dist-tags': {
          'latest': '4.0.2',
          'next': '4.0.2'
        },
        versions: {
          '1.0.0': true,
          '1.0.1': true,
          '2.0.0': true,
          '2.0.1': true,
          '2.0.2': true,
          '2.0.3': true,
          '2.1.0': true,
          '2.2.0': true,
          '3.0.0': true,
          '3.0.1': true,
          '3.1.0': true,
          '3.1.1': true,
          '4.0.0': true,
          '4.0.1': true,
          '4.0.2': true
        }
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const devDependencies = {
        '@semantic-release/git': '2.0.0'
      }
      const newPkg = JSON.parse(
        transforms[0].transform(JSON.stringify({ devDependencies }))
      )
      transforms[0].created = true
      expect(newPkg.devDependencies['@semantic-release/git']).toEqual('2.0.0')

      const newReadme = transforms[2].transform(
        'readme-badger\n=============\n',
        'README.md'
      )
      // 'includes badge'
      expect(newReadme).toMatch(/https:\/\/badges.greenkeeper.io\/espy\/test.svg/)

      return '1234abcd'
    })
    const createInitialBranch = require('../../jobs/create-initial-branch')

    const newJob = await createInitialBranch({repositoryId: 52})
    const newBranch = await repositories.get('52:branch:1234abcd')
    const repoDoc = await repositories.get('52')

    expect(newJob).toBeTruthy()
    expect(newJob.data.name).toEqual('initial-timeout-pr')
    expect(newJob.data.repositoryId).toBe(52)
    expect(newJob.delay).toBeGreaterThan(10000)
    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeTruthy()
    expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/espy/test.svg')
    expect(repoDoc.packages['package.json'].greenkeeper.ignore).toContain('@semantic-release/git')
  })
  function encodePkg (pkg) {
    return Buffer.from(JSON.stringify(pkg)).toString('base64')
  }
})
