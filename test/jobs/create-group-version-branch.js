const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()

const dbs = require('../../lib/dbs')
const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('create-group-version-branch', async t => {
  t.beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    return Promise.resolve()
  })

  const { installations, repositories } = await dbs()

  t.test('new pull request, 1 group, 2 packages, same dependencyType', async t => {
    await installations.put({
      _id: '123-two-packages',
      installation: 87,
      plan: 'free'
    })
    await repositories.put({
      _id: '123-monorepo',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages',
      packages: {
        'package.json': {
          dependencies: {
            react: '1.0.0'
          },
          greenkeeper: {
            'groups': {
              'default': {
                'packages': [
                  'package.json',
                  'backend/package.json'
                ]
              }
            }
          }
        },
        'backend/package.json': {
          dependencies: {
            react: '1.0.0'
          }
        }
      }
    })
    t.plan(20)

    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/hans/monorepo/pulls')
      .reply(200, (uri, requestBody) => {
        t.pass('pull request created')
        t.is(JSON.parse(requestBody).title, 'Update react in group default to the latest version 🚀', 'PR has correct title')
        t.is(JSON.parse(requestBody).head, 'greenkeeper/default/react-2.0.0', 'PR has correct head')
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })
      .post(
        '/repos/hans/monorepo/issues/66/labels'
      )
      .reply(201, () => {
        t.pass('label created')
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        t.pass('status created')
        return {}
      })

    const worker = proxyquire('../../jobs/create-group-version-branch', {
      '../lib/get-infos': (
        { installationId, dependency, version, diffBase, versions }
      ) => {
        t.pass('used get-infos')
        t.same(
          versions,
          {
            '1.0.0': {},
            '2.0.0': {}
          },
          'passed the versions'
        )
        t.is(version, '2.0.0', 'passed correct version')
        t.is(installationId, 87, 'passed the installationId object')
        t.is(dependency, 'react', 'passed correct dependency')
        return {
          dependencyLink: '[]()',
          release: 'the release',
          diffCommits: 'commits...'
        }
      },
      '../lib/get-changelog': ({ token, slug, version }) => '[changelog]',
      '../lib/get-diff-commits': () => ({
        html_url: 'https://github.com/lkjlsgfj/',
        total_commits: 0,
        behind_by: 0,
        commits: []
      }),
      '../lib/create-branch': ({ transforms }) => {
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: 'react',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo',
      types: [
        {type: 'dependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: {
        'default': {
          'packages': [
            'package.json',
            'backend/package.json'
          ]
        }
      },
      monorepo: [
        { id: '123-monorepo',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'backend/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } } ]
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('123-monorepo:branch:1234abcd')
    const pr = await repositories.get('123-monorepo:pr:321')
    t.ok(branch.processed, 'branch is processed')
    t.is(branch.head, 'greenkeeper/default/react-2.0.0', 'correct branch name')
    t.is(branch.repositoryId, '123-monorepo', 'correct repo ID for branch')
    t.is(branch.accountId, '123-two-packages', 'correct account ID for branch')
    t.is(branch.dependencyType, 'dependencies', 'correct dependencyType in branch')
    t.is(pr.number, 66, 'correct pr number')
    t.is(pr.state, 'open', 'pr status open')
    t.is(pr.repositoryId, '123-monorepo', 'correct repo ID for pr')
    t.is(pr.accountId, '123-two-packages', 'correct account ID for pr')
  })

  t.test('new pull request, 1 group, 2 packages, different dependencyType', async t => {
    await installations.put({
      _id: '123-two-packages-different-types',
      installation: 88,
      plan: 'free'
    })
    await repositories.put({
      _id: '123-monorepo-different-types',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages-different-types',
      packages: {
        'package.json': {
          dependencies: {
            react: '1.0.0'
          },
          greenkeeper: {
            'groups': {
              'default': {
                'packages': [
                  'package.json',
                  'backend/package.json'
                ]
              }
            }
          }
        },
        'backend/package.json': {
          devDependencies: {
            react: '1.0.0'
          }
        }
      }
    })
    t.plan(20)

    const githubMock = nock('https://api.github.com')
      .post('/installations/88/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/hans/monorepo/pulls')
      .reply(200, (uri, requestBody) => {
        t.pass('pull request created')
        t.is(JSON.parse(requestBody).title, 'Update react in group default to the latest version 🚀', 'PR has correct title')
        t.is(JSON.parse(requestBody).head, 'greenkeeper/default/react-2.0.0', 'PR has correct head')
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })
      .post(
        '/repos/hans/monorepo/issues/66/labels'
      )
      .reply(201, () => {
        t.pass('label created')
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        t.pass('status created')
        return {}
      })

    const worker = proxyquire('../../jobs/create-group-version-branch', {
      '../lib/get-infos': (
        { installationId, dependency, version, diffBase, versions }
      ) => {
        t.pass('used get-infos')
        t.same(
          versions,
          {
            '1.0.0': {},
            '2.0.0': {}
          },
          'passed the versions'
        )
        t.is(version, '2.0.0', 'passed correct version')
        t.is(installationId, 88, 'passed the installationId object')
        t.is(dependency, 'react', 'passed correct dependency')
        return {
          dependencyLink: '[]()',
          release: 'the release',
          diffCommits: 'commits...'
        }
      },
      '../lib/get-changelog': ({ token, slug, version }) => '[changelog]',
      '../lib/get-diff-commits': () => ({
        html_url: 'https://github.com/lkjlsgfj/',
        total_commits: 0,
        behind_by: 0,
        commits: []
      }),
      '../lib/create-branch': ({ transforms }) => {
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: 'react',
      accountId: '123-two-packages-different-types',
      repositoryId: '123-monorepo-different-types',
      types: [
        {type: 'devDependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: {
        'default': {
          'packages': [
            'package.json',
            'backend/package.json'
          ]
        }
      },
      monorepo: [
        { id: '123-monorepo-different-types',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages-different-types',
            filename: 'package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo-different-types',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages-different-types',
            filename: 'backend/package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } } ]
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('123-monorepo-different-types:branch:1234abcd')
    const pr = await repositories.get('123-monorepo-different-types:pr:321')
    t.ok(branch.processed, 'branch is processed')
    t.is(branch.head, 'greenkeeper/default/react-2.0.0', 'correct branch name')
    t.is(branch.repositoryId, '123-monorepo-different-types', 'correct repo ID for branch')
    t.is(branch.accountId, '123-two-packages-different-types', 'correct account ID for branch')
    t.is(branch.dependencyType, 'dependencies', 'correct dependencyType in branch')
    t.is(pr.number, 66, 'correct pr number')
    t.is(pr.state, 'open', 'pr status open')
    t.is(pr.repositoryId, '123-monorepo-different-types', 'correct repo ID for pr')
    t.is(pr.accountId, '123-two-packages-different-types', 'correct account ID for pr')
  })
})

tearDown(async () => {
  const { installations, repositories } = await dbs()

  await Promise.all([
    // Test 1
    installations.remove(await installations.get('123-two-packages')),
    repositories.remove(await repositories.get('123-monorepo:branch:1234abcd')),
    repositories.remove(await repositories.get('123-monorepo:pr:321')),
    repositories.remove(await repositories.get('123-monorepo')),
    // Test 2
    installations.remove(await installations.get('123-two-packages-different-types')),
    repositories.remove(await repositories.get('123-monorepo-different-types:branch:1234abcd')),
    repositories.remove(await repositories.get('123-monorepo-different-types:pr:321')),
    repositories.remove(await repositories.get('123-monorepo-different-types'))
  ])
})
