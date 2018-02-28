const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create initial brach', () => {
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
      installation: 37,
      plan: 'free'
    })

    await payments.put({
      _id: '123',
      stripeSubscriptionId: 'stripe123',
      plan: 'personal'
    })
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
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
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
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
        content: encodePkg({ who: 'cares' })
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })

    const newJob = await createInitialBranch({repositoryId: 44})
    expect(newJob).toBeFalsy()
    const repodoc = await repositories.get('44')
    const files = repodoc.files
    const expectedFiles = {
      'npm-shrinkwrap.json': false,
      'package-lock.json': true,
      'package.json': true,
      'yarn.lock': false
    }

    expect(files).toMatchObject(expectedFiles)
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
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
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
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test/contents/package.json')
      .reply(200, {
        path: 'package.json',
        content: encodePkg({ dependencies: {} })
      })
      .get('/repos/finnp/test/contents/package-lock.json')
      .reply(200, {
        path: 'package-lock.json',
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
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
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

  afterAll(async () => {
    const { installations, repositories, payments } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(payments, '123'),
      removeIfExists(repositories, '42', '43', '44', '45', '46', '42:branch:1234abcd')
    ])
  })

  function encodePkg (pkg) {
    return Buffer.from(JSON.stringify(pkg)).toString('base64')
  }
})
