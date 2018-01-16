const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()

const dbs = require('../../lib/dbs')

test('create-version-branch', async t => {
  const { installations, repositories, payments } = await dbs()

  await installations.put({
    _id: '123',
    installation: 37
  })
  await installations.put({
    _id: '124',
    installation: 38
  })
  await installations.put({
    _id: '125',
    installation: 39
  })
  await installations.put({
    _id: '2323',
    installation: 40
  })

  t.test('new pull request', async t => {
    await repositories.put({
      _id: '42',
      accountId: '123',
      fullName: 'finnp/test',
      packages: {
        'package.json': {
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    t.plan(13)

    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, () => {
        t.pass('pull request created')
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .post(
        '/repos/finnp/test/issues/66/labels',
        body => body[0] === 'customlabel'
      )
      .reply(201, () => {
        t.pass('label created')
        return {}
      })
      .post(
        '/repos/finnp/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        t.pass('status created')
        return {}
      })

    const worker = proxyquire('../../jobs/create-version-branch', {
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
        t.is(installationId, 37, 'passed the installationId object')
        t.is(dependency, '@finnpauls/dep', 'passed correct dependency')
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
      '../lib/create-branch': ({ transform }) => {
        const newPkg = JSON.parse(
          transform(
            JSON.stringify({
              devDependencies: {
                '@finnpauls/dep': '^1.0.0'
              }
            })
          )
        )
        t.is(
          newPkg.devDependencies['@finnpauls/dep'],
          '^2.0.0',
          'changed to the right version'
        )
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: '@finnpauls/dep',
      accountId: '123',
      repositoryId: '42',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('42:branch:1234abcd')
    const pr = await repositories.get('42:pr:321')
    t.ok(branch.processed, 'branch is processed')
    t.is(pr.number, 66, 'correct pr number')
    t.is(pr.state, 'open', 'pr status open')
  })

  t.test('new pull request private repo', async t => {
    await repositories.put({
      _id: '421',
      accountId: '124',
      fullName: 'finnp/testtest',
      private: true,
      packages: {
        'package.json': {
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    await payments.put({
      _id: '124',
      plan: 'personal'
    })
    t.plan(13)

    const githubMock = nock('https://api.github.com')
      .post('/installations/38/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/finnp/testtest/pulls')
      .reply(200, () => {
        t.pass('pull request created')
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/finnp/testtest')
      .reply(200, {
        default_branch: 'master'
      })
      .post(
        '/repos/finnp/testtest/issues/66/labels',
        body => body[0] === 'customlabel'
      )
      .reply(201, () => {
        t.pass('label created')
        return {}
      })
      .post(
        '/repos/finnp/testtest/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        t.pass('status created')
        return {}
      })

    const worker = proxyquire('../../jobs/create-version-branch', {
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
        t.is(installationId, 38, 'passed the installationId object')
        t.is(dependency, '@finnpauls/dep', 'passed correct dependency')
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
      '../lib/create-branch': ({ transform }) => {
        const newPkg = JSON.parse(
          transform(
            JSON.stringify({
              devDependencies: {
                '@finnpauls/dep': '^1.0.0'
              }
            })
          )
        )
        t.is(
          newPkg.devDependencies['@finnpauls/dep'],
          '^2.0.0',
          'changed to the right version'
        )
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: '@finnpauls/dep',
      accountId: '124',
      repositoryId: '421',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('42:branch:1234abcd')
    const pr = await repositories.get('42:pr:321')
    t.ok(branch.processed, 'branch is processed')
    t.is(pr.number, 66, 'correct pr number')
    t.is(pr.state, 'open', 'pr status open')
  })

  t.test('no pull request private repo with free account', async t => {
    await repositories.put({
      _id: '46',
      accountId: '125',
      fullName: 'finnp/testtest',
      private: true,
      packages: {
        'package.json': {
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    await payments.put({
      _id: '125',
      plan: 'free'
    })
    t.plan(1)

    const githubMock = nock('https://api.github.com')
      .post('/installations/38/access_tokens')
      .optionally()
      .reply(200, () => {
        t.fail('should not talk to github')
        return { token: 'secret' }
      })

    const worker = proxyquire('../../jobs/create-version-branch', {
      '../lib/get-infos': (
        { installationId, dependency, version, diffBase, versions }
      ) => {
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
      '../lib/create-branch': ({ transform }) => {
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: '@finnpauls/dep',
      accountId: '125',
      repositoryId: '46',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
  })

  t.test('comment pr', async t => {
    await Promise.all([
      repositories.put({
        _id: '43:pr:5',
        state: 'open',
        type: 'pr',
        repositoryId: '43',
        number: 5,
        comments: [],
        dependency: '@finnpauls/dep2'
      }),
      repositories.put({
        _id: '43',
        accountId: '123',
        fullName: 'finnp/test2',
        packages: {
          'package.json': {
            greenkeeper: {
              label: 'customlabel'
            }
          }
        }
      })
    ])

    t.plan(9)

    nock('https://registry.npmjs.org')
      .get('/@finnpauls%2Fdep2')
      .reply(200, () => {
        return {
          repository: {
            url: 'https://github.com/finnp/dep2'
          }
        }
      })

    nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .get('/repos/finnp/test2')
      .reply(200, {
        default_branch: 'master'
      })
      .post('/repos/finnp/test2/issues/5/comments')
      .reply(201, () => {
        t.pass('comment created')
        return {}
      })

    const worker = proxyquire('../../jobs/create-version-branch', {
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
        t.is(installationId, 37, 'passed the installationId object')
        t.is(dependency, '@finnpauls/dep2', 'passed correct dependency')
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
      '../lib/create-branch': ({ transform }) => {
        const newPkg = JSON.parse(
          transform(
            JSON.stringify({
              devDependencies: {
                '@finnpauls/dep2': '^1.0.0'
              }
            })
          )
        )
        t.is(
          newPkg.devDependencies['@finnpauls/dep2'],
          '^2.0.0',
          'changed to the right version'
        )
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: '@finnpauls/dep2',
      accountId: '123',
      repositoryId: '43',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('43:branch:1234abcd')
    t.ok(branch.processed, 'branch is processed')
  })

  t.test('no downgrades', async t => {
    await repositories.put({
      _id: '44',
      accountId: '123',
      fullName: 'finnp/test',
      packages: {
        'package.json': {
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })

    t.plan(2)

    const worker = proxyquire('../../jobs/create-version-branch', {
      '../lib/create-branch': ({ transform }) => {
        const newPkg = transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^2.0.1'
            }
          })
        )
        t.notOk(newPkg, 'abort on downgrade')
      }
    })

    const githubMock = nock('https://api.github.com')
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })

    const newJob = await worker({
      dependency: '@finnpauls/dep',
      accountId: '123',
      repositoryId: '42',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^2.0.1',
      oldVersionResolved: '2.0.1',
      versions: {
        '1.0.0': {},
        '2.0.1': {}
      }
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
  })

  t.test('ignore invalid oldVersion', async t => {
    const worker = require('../../jobs/create-version-branch')

    const newJob = await worker({
      distTag: 'latest',
      oldVersion: 'invalid/version'
    })

    t.notOk(newJob, 'no new job scheduled')
    t.end()
  })

  t.test('ignore ignored dependencies', async t => {
    await repositories.put({
      _id: '45',
      accountId: '123',
      fullName: 'finnp/test',
      packages: {
        'package.json': {
          greenkeeper: {
            ignore: ['a', 'b', 'c']
          }
        }
      }
    })

    const worker = require('../../jobs/create-version-branch')

    const newJob = await worker({
      dependency: 'b',
      distTag: 'latest',
      accountId: '123',
      repositoryId: '45',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '1.0.0'
    })

    t.notOk(newJob, 'no new job scheduled')
    t.end()
  })

  t.test('bails if in range and shrinkwrap', async t => {
    await repositories.put({
      _id: '47',
      accountId: '2323',
      fullName: 'espy/test',
      files: {
        'package.json': true,
        'package-lock.json': false,
        'npm-shrinkwrap.json': true,
        'yarn.lock': false
      },
      packages: {
        'package.json': {}
      }
    })

    const worker = require('../../jobs/create-version-branch')

    const newJob = await worker({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '47',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    t.notOk(newJob, 'no new job scheduled')
    t.end()
  })

  t.test('bails if in range and project lockfile and no gk-lockfile', async t => {
    await repositories.put({
      _id: '48',
      accountId: '2323',
      fullName: 'espy/test',
      files: {
        'package.json': true,
        'package-lock.json': true,
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'package.json': {}
      }
    })

    const worker = require('../../jobs/create-version-branch')

    const newJob = await worker({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '48',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    t.notOk(newJob, 'no new job scheduled')
    t.end()
  })

  t.test('bails if in range and project lockfile, has gk-lockfile, but onlyUpdateLockfilesIfOutOfRange is true', async t => {
    await repositories.put({
      _id: '49',
      accountId: '2323',
      fullName: 'espy/test',
      files: {
        'package.json': true,
        'package-lock.json': true,
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'package.json': {
          devDependencies: {
            'greenkeeper-lockfile': '1.1.1'
          },
          greenkeeper: {
            lockfiles: {
              outOfRangeUpdatesOnly: true
            }
          }
        }
      }
    })

    const worker = require('../../jobs/create-version-branch')

    const newJob = await worker({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '49',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    t.notOk(newJob, 'no new job scheduled')
    t.end()
  })

  t.test('runs if in range, has project lockfile, has gk-lockfile', async t => {
    await repositories.put({
      _id: '50',
      accountId: '2323',
      fullName: 'espy/test',
      files: {
        'package.json': true,
        'package-lock.json': true,
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'package.json': {
          devDependencies: {
            'greenkeeper-lockfile': '1.1.1'
          }
        }
      }
    })
    t.plan(5)

    const githubMock = nock('https://api.github.com')
      .post('/installations/40/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .post('/repos/espy/test/pulls')
      .reply(200, () => {
        t.pass('pull request created')
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/espy/test')
      .reply(200, {
        default_branch: 'master'
      })
      .post(
        '/repos/espy/test/issues/66/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        return {}
      })
      .post(
        '/repos/espy/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        return {}
      })

    const worker = proxyquire('../../jobs/create-version-branch', {
      '../lib/get-infos': (
        { installationId, dependency, version, diffBase, versions }
      ) => {
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
      '../lib/create-branch': ({ transform }) => {
        return '1234abcd'
      }
    })

    const newJob = await worker({
      dependency: '@finnpauls/dep',
      accountId: '2323',
      repositoryId: '50',
      type: 'devDependencies',
      distTag: 'latest',
      distTags: {
        latest: '2.0.0'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    githubMock.done()
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('50:branch:1234abcd')
    const pr = await repositories.get('50:pr:321')
    t.ok(branch.processed, 'branch is processed')
    t.is(pr.number, 66, 'correct pr number')
    t.is(pr.state, 'open', 'pr status open')
    t.end()
  })
})

tearDown(async () => {
  const { installations, repositories, payments } = await dbs()

  await Promise.all([
    installations.remove(await installations.get('123')),
    installations.remove(await installations.get('124')),
    installations.remove(await installations.get('125')),
    installations.remove(await installations.get('2323')),
    repositories.remove(await repositories.get('42:branch:1234abcd')),
    repositories.remove(await repositories.get('43:branch:1234abcd')),
    repositories.remove(await repositories.get('42:pr:321')),
    repositories.remove(await repositories.get('43:pr:5')),
    repositories.remove(await repositories.get('42')),
    repositories.remove(await repositories.get('43')),
    repositories.remove(await repositories.get('44')),
    repositories.remove(await repositories.get('421')),
    repositories.remove(await repositories.get('45')),
    repositories.remove(await repositories.get('46')),
    repositories.remove(await repositories.get('47')),
    repositories.remove(await repositories.get('48')),
    repositories.remove(await repositories.get('49')),
    repositories.remove(await repositories.get('50')),
    repositories.remove(await repositories.get('50:branch:1234abcd')),
    repositories.remove(await repositories.get('50:pr:321')),
    payments.remove(await payments.get('124')),
    payments.remove(await payments.get('125'))
  ])
})
