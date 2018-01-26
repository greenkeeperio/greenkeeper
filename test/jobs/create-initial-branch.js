const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()
const _ = require('lodash')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

const dbs = require('../../lib/dbs')

test('create-initial-branch', async t => {
  t.beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    return Promise.resolve()
  })

  const { installations, repositories, payments } = await dbs()

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

  const devDependencies = {
    '@finnpauls/dep': '1.0.0',
    '@finnpauls/dep2': '1.0.0'
  }

  t.test('create pr', async t => {
    await repositories.put({
      _id: '42',
      accountId: '123',
      fullName: 'finnp/test'
    })

    t.plan(10)

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

    const worker = proxyquire('../../jobs/create-initial-branch', {
      '../lib/create-branch': ({ transforms }) => {
        const newPkg = JSON.parse(
          transforms[0].transform(JSON.stringify({ devDependencies }))
        )
        transforms[0].created = true
        t.is(newPkg.devDependencies['@finnpauls/dep'], '2.0.0')
        t.is(newPkg.devDependencies['@finnpauls/dep2'], '2.0.0')

        const newReadme = transforms[2].transform(
          'readme-badger\n=============\n',
          'README.md'
        )
        t.ok(
          _.includes(
            newReadme,
            'https://badges.greenkeeper.io/finnp/test.svg',
            'includes badge'
          )
        )
        return '1234abcd'
      }
    })

    const newJob = await worker({
      repositoryId: 42
    })

    t.ok(newJob)
    t.is(newJob.data.name, 'initial-timeout-pr')
    t.is(newJob.data.repositoryId, 42)
    t.ok(newJob.delay > 10000, 'some delay present')
    const newBranch = await repositories.get('42:branch:1234abcd')
    t.is(newBranch.type, 'branch', 'type === branch')
    t.ok(newBranch.initial, 'initial')
    t.is(
      newBranch.badgeUrl,
      'https://badges.greenkeeper.io/finnp/test.svg',
      'badgeUrl'
    )
  })

  t.test('badge already added', async t => {
    await repositories.put({
      _id: '44',
      accountId: '123',
      fullName: 'finnp/test'
    })
    const worker = proxyquire('../../jobs/create-initial-branch', {
      '../lib/create-branch': ({ transforms }) => {
        transforms[2].transform(
          'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.sv',
          'README.md'
        )
      }
    })

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
    const newJob = await worker({
      repositoryId: 44
    })
    t.notOk(newJob)
    const repodoc = await repositories.get('44')
    t.ok(repodoc.files['package.json'])
    t.ok(repodoc.files['package-lock.json'])
    t.notOk(repodoc.files['yarn.lock'])
    t.ok(repodoc.enabled, 'repository was enabled')
    t.end()
  })

  t.test('badge already added for private repo', async t => {
    await repositories.put({
      _id: '45',
      accountId: '123',
      fullName: 'finnp/test',
      private: true
    })
    const worker = proxyquire('../../jobs/create-initial-branch', {
      '../lib/create-branch': ({ transforms }) => {
        transforms[2].transform(
          'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.sv',
          'README.md'
        )
      }
    })

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
    const newJob = await worker({
      repositoryId: 45
    })
    t.ok(newJob)
    t.equal(newJob.data.name, 'update-payments')
    t.equal(newJob.data.accountId, '123')
    t.end()
  })

  t.test('badge already added for private repo within GKE', async t => {
    process.env.IS_ENTERPRISE = true

    await repositories.put({
      _id: '46',
      accountId: '123',
      fullName: 'finnp/test',
      private: true
    })
    const worker = proxyquire('../../jobs/create-initial-branch', {
      '../lib/create-branch': ({ transforms }) => {
        transforms[2].transform(
          'readme-badger\n=============\nhttps://badges.greenkeeper.io/finnp/test.sv',
          'README.md'
        )
      }
    })

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
    const newJob = await worker({
      repositoryId: 46
    })

    t.notOk(newJob)
    t.end()
  })

  t.test('ignore forks without issues enabled', async t => {
    await repositories.put({
      _id: '43',
      accountId: '123',
      fullName: 'finnp/test2',
      fork: true,
      hasIssues: false
    })

    const worker = require('../../jobs/create-initial-branch')

    nock('https://api.github.com')
    .post('/installations/37/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})

    const newJob = await worker({
      repositoryId: 43
    })
    t.notOk(newJob)
    try {
      await repositories.get('43:branch:1234abcd')
    } catch (e) {
      t.pass('no pr created')
    }
    t.end()
  })
})

tearDown(async () => {
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
