const nock = require('nock')
const simple = require('simple-mock')

const dbs = require('../../lib/dbs')
const { requireFresh, cleanCache } = require('../helpers/module-cache-helpers')
const removeIfExists = require('../helpers/remove-if-exists')

describe('create-initial-pr', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.setTimeout(20000)
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
  })

  beforeAll(async() => {
    const { repositories, payments } = await dbs()

    await payments.put({
      _id: '123free',
      plan: 'free'
    })

    await payments.put({
      _id: '123opensource',
      plan: 'opensource'
    })

    await payments.put({
      _id: '123stripe',
      plan: 'personal',
      stripeSubscriptionId: 'si123'
    })

    await payments.put({
      _id: '123team',
      plan: 'team'
    })

    await payments.put({
      _id: '123business',
      plan: 'business'
    })

    await repositories.put({
      _id: 'repoId:branch:1234abcd',
      type: 'branch',
      initial: true,
      sha: '1234abcd',
      base: 'master',
      head: 'greenkeeper/initial',
      processed: false,
      depsUpdated: true,
      badgeUrl: 'https://badges.greenkeeper.io/finnp/test.svg',
      createdAt: '2017-01-13T17:33:56.698Z',
      updatedAt: '2017-01-13T17:33:56.698Z'
    })

    await repositories.put({
      _id: 'repoId:branch:monorepo1',
      type: 'branch',
      initial: true,
      sha: 'monorepo1',
      base: 'master',
      head: 'greenkeeper/initial',
      processed: false,
      depsUpdated: true,
      badgeUrl: 'https://badges.greenkeeper.io/finnp/test.svg',
      createdAt: '2017-01-13T17:33:56.698Z',
      updatedAt: '2017-01-13T17:33:56.698Z',
      greenkeeperConfigInfo: { isMonorepo: true, action: 'new', deletedGroups: [], deletedPackageFiles: [] }
    })

    await repositories.put({
      _id: 'repoId:branch:monorepo2',
      type: 'branch',
      initial: true,
      sha: 'monorepo2',
      base: 'master',
      head: 'greenkeeper/initial',
      processed: false,
      depsUpdated: true,
      badgeUrl: 'https://badges.greenkeeper.io/finnp/test.svg',
      createdAt: '2017-01-13T17:33:56.698Z',
      updatedAt: '2017-01-13T17:33:56.698Z',
      greenkeeperConfigInfo: {
        isMonorepo: true,
        action: 'updated',
        deletedGroups: ['empty'],
        deletedPackageFiles: [
          'this-file-no-longer-exists/package.json',
          'this-whole-group-should-disappear/package.json'
        ]}
    })
  })

  test('create pr for account with `free` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '42',
      accountId: '123free',
      fullName: 'finnp/test'
    })

    expect.assertions(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/test/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/test/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 42 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123free'
    })
  })

  test('create pr for private repo for account with `free` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '42b',
      accountId: '123free',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, (args) => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // payment required status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/private/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/private/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: '42b' },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123free'
    })
  })

  test('create pr for private repo for account with `opensource` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '46',
      accountId: '123opensource',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // payment required status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/private/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/private/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 46 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123opensource'
    })
  })

  test('create pr for private repo within GKE', async () => {
    process.env.IS_ENTERPRISE = true
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '47',
      accountId: '123opensource',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // payment required status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
      '/repos/finnp/private/issues/3/labels',
      body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 47 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123opensource'
    })
  })

  test('create pr for private repo and account with stripe `personal` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '43',
      accountId: '123stripe',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
      '/repos/finnp/private/issues/3/labels',
      body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 43 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123stripe'
    })
  })

  test('create pr for private repo and account with Github `team` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '44',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
      '/repos/finnp/private/issues/3/labels',
      body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 44 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123team'
    })
  })

  test('create pr for private repo and account with Github `team` plan with payment required', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const payments = require('../../lib/payments')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '44b',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // payment required status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
      '/repos/finnp/private/issues/3/labels',
      body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    simple.mock(payments, 'getAmountOfCurrentlyPrivateAndEnabledRepos').returnWith(15)

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: '44b' },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123team'
    })
    simple.restore()
  })

  test('create pr for private repo and account with Github `business` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '45',
      accountId: '123business',
      fullName: 'finnp/private',
      private: true
    })

    expect.assertions(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/private')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 333,
          number: 3
        }
      })
      .post(
      '/repos/finnp/private/issues/3/labels',
      body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:1234abcd')
    await createInitial({
      repository: { id: 45 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123business'
    })
  })

  test('create pr for monorepo with new greenkeeper.json on account with `free` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '48',
      accountId: '123free',
      fullName: 'finnp/test'
    })

    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/statuses/monorepo1')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/test/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, (uri, requestBody) => {
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).body).toMatch('Greenkeeper has detected multiple `package.json` files. They have all been added to a new `greenkeeper.json` config file.')
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/test/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:monorepo1')
    await createInitial({
      repository: { id: 48 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123free'
    })
  })

  test('create pr for monorepo with existing, outdated greenkeeper.json on account with `free` plan', async () => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: '49',
      accountId: '123free',
      fullName: 'finnp/test'
    })

    expect.assertions(4)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/statuses/monorepo2')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/test/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, (uri, requestBody) => {
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).body).toMatch('Greenkeeper has detected multiple `package.json` files. Since this repo already has a `greenkeeper.json` config file with defined groups, Greenkeeper has only checked whether they’re still valid. The follwing `package.json` files could no longer be found in the repo and have been removed from your groups config: `this-file-no-longer-exists/package.json, this-whole-group-should-disappear/package.json`. Also, groups which no longer have any entries have been removed: `empty`.')
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/finnp/test/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('repoId:branch:monorepo2')
    await createInitial({
      repository: { id: 49 },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123free'
    })
  })

  afterAll(async () => {
    const { repositories, payments } = await dbs()

    await Promise.all([
      removeIfExists(payments, '123free', '123opensource', '123stripe', '123team', '123business'),
      removeIfExists(repositories, '42', ' 42b', '43', '44', '44b', '45', '46', 'repoId:branch:1234abcd', '47', '48', '49', 'repoId:branch:monorepo1', 'repoId:branch:monorepo2')
    ])
  })
})
