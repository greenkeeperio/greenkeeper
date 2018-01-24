const { test, tearDown } = require('tap')
const nock = require('nock')
const simple = require('simple-mock')

const dbs = require('../../lib/dbs')
const { requireFresh, cleanCache } = require('../helpers/module-cache-helpers')

test('create-initial-pr', async t => {
  t.beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    return Promise.resolve()
  })

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

  const branchDoc = await repositories.get('repoId:branch:1234abcd')

  t.test('create pr for account with `free` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '42',
      accountId: '123free',
      fullName: 'finnp/test'
    })

    t.plan(3)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/finnp/test/statuses/1234abcd')
      .reply(201, () => {
        t.pass('verify status added')
        return {}
      })
      .post(
        '/repos/finnp/test/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo for account with `free` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '42b',
      accountId: '123free',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(4)

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
        t.pass('verify status added')
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        t.pass('payment required status added')
        return {}
      })
      .post(
        '/repos/finnp/private/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo for account with `opensource` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '46',
      accountId: '123opensource',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(4)

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
        t.pass('verify status added')
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        t.pass('payment required status added')
        return {}
      })
      .post(
        '/repos/finnp/private/pulls',
        ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo within GKE', async t => {
    process.env.IS_ENTERPRISE = true
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '47',
      accountId: '123opensource',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(3)

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
        t.pass('payment required status added')
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo and account with stripe `personal` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '43',
      accountId: '123stripe',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(3)

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
        t.pass('verify status added')
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo and account with Github `team` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '44',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(3)

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
        t.pass('verify status added')
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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

  t.test('create pr for private repo and account with Github `team` plan with payment required', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')
    const payments = require('../../lib/payments')

    await repositories.put({
      _id: '44b',
      accountId: '123team',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(4)

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
        t.pass('verify status added')
        return {}
      })
      .post('/repos/finnp/private/statuses/1234abcd')
      .reply(201, () => {
        t.pass('payment required status added')
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

    simple.mock(payments, 'getAmountOfCurrentlyPrivateAndEnabledRepos').returnWith(15)

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

  t.test('create pr for private repo and account with Github `business` plan', async t => {
    const createInitial = requireFresh('../../jobs/create-initial-pr')

    await repositories.put({
      _id: '45',
      accountId: '123business',
      fullName: 'finnp/private',
      private: true
    })

    t.plan(3)

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
        t.pass('verify status added')
        return {}
      })
      .post(
      '/repos/finnp/private/pulls',
      ({ head }) => head === 'greenkeeper/initial'
      )
      .reply(201, () => {
        t.pass('pull request created')
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
        t.pass('label created')
        return {}
      })

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
})

tearDown(async () => {
  const { repositories, payments } = await dbs()

  await payments.remove(await payments.get('123free'))
  await payments.remove(await payments.get('123opensource'))
  await payments.remove(await payments.get('123stripe'))
  await payments.remove(await payments.get('123team'))
  await payments.remove(await payments.get('123business'))
  await repositories.remove(await repositories.get('42'))
  await repositories.remove(await repositories.get('42b'))
  await repositories.remove(await repositories.get('43'))
  await repositories.remove(await repositories.get('44'))
  await repositories.remove(await repositories.get('44b'))
  await repositories.remove(await repositories.get('45'))
  await repositories.remove(await repositories.get('46'))
  await repositories.remove(await repositories.get('repoId:branch:1234abcd'))
  await repositories.remove(await repositories.get('47'))
})
