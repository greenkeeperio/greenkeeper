const nock = require('nock')

const enterprisePrivateKey = require('../helpers/enterprise-private-key')
const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost:5984')

let defaultPrivateKey = process.env.PRIVATE_KEY
describe('create version branch', () => {
  beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    defaultPrivateKey ? process.env.PRIVATE_KEY = defaultPrivateKey : delete process.env.PRIVATE_KEY
    jest.resetModules()
    jest.clearAllMocks()
    nock.cleanAll()
  })
  beforeAll(async () => {
    const { installations, npm } = await dbs()
    await installations.put({
      _id: '123',
      installation: 37
    })
    await installations.put({
      _id: '124',
      installation: 38
    })
    await installations.put({
      _id: '124gke',
      installation: 124
    })
    await installations.put({
      _id: '125',
      installation: 39
    })
    await installations.put({
      _id: '126',
      installation: 41
    })
    await installations.put({
      _id: '127',
      installation: 42
    })
    await installations.put({
      _id: '2323',
      installation: 40
    })

    await npm.put({
      _id: '@finnpauls/dep',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep.git'
          }
        },
        '2.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep.git'
          }
        }
      }
    })

    await npm.put({
      _id: '@finnpauls/dep2',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep2.git'
          }
        },
        '2.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep2.git'
          }
        }
      }
    })
  })
  afterAll(async () => {
    const { installations, repositories, payments, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123', '124', '124gke', '125', '126', '127', '2323'),
      removeIfExists(npm, '@finnpauls/dep', '@finnpauls/dep2', 'jest', 'best'),
      removeIfExists(payments, '124', '125'),
      removeIfExists(repositories, '1', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '86', 'too-many-packages', 'prerelease', 'ignored-in-group-1'),
      removeIfExists(repositories, '41:branch:1234abcd', '42:branch:1234abcd', '43:branch:1234abcd', '50:branch:1234abcd', '86:branch:1234abcd',
        '1:branch:2222abcd', '41:pr:321', '50:pr:321', '1:pr:3210', '50_cvb_lockfile', '50_cvb_lockfile:pr:1234', '50_cvb_lockfile:branch:1234abcd')
    ])
  })

  test('new pull request', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '1',
      accountId: '123',
      fullName: 'finnp/test',
      packages: {
        'package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          },
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    expect.assertions(9)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, (req, res) => {
        expect(JSON.parse(res).body).toMatchSnapshot()
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      const transformFunc = await transforms[0]
      const newPkg = JSON.parse(
        transformFunc.transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
      transforms[0].created = true
      const devDependency = newPkg.devDependencies['@finnpauls/dep']
      expect(devDependency).toEqual('^2.0.0')
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '123',
      repositoryId: '1',
      type: 'devDependencies',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('1:branch:1234abcd')
    const pr = await repositories.get('1:pr:321')
    expect(branch.processed).toBeTruthy()
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('new pull request private repo', async () => {
    const { repositories, payments } = await dbs()
    await repositories.put({
      _id: '42',
      accountId: '124',
      fullName: 'finnp/testtest',
      private: true,
      files: {
        'package.json': true,
        'package-lock.json': false,
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          },
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
    expect.assertions(9)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/38/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/testtest/pulls')
      .reply(200, (uri, req) => {
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/testtest/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
      //  status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      const transformFunc = await transforms[0]
      const newPkg = JSON.parse(
        transformFunc.transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
      transforms[0].created = true
      const devDependency = newPkg.devDependencies['@finnpauls/dep']
      expect(devDependency).toEqual('^2.0.0')
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '124',
      repositoryId: '42',
      type: 'devDependencies',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    // no new job scheduled
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('42:branch:1234abcd')
    const pr = await repositories.get('42:pr:321')
    expect(branch.processed).toBeTruthy()
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('new pull request private repo within GKE', async () => {
    process.env.IS_ENTERPRISE = true
    process.env.PRIVATE_KEY = enterprisePrivateKey
    const { repositories } = await dbs()

    await repositories.put({
      _id: '41',
      accountId: '124gke',
      fullName: 'finnp/testtest',
      private: true,
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      },
      packages: {
        'package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          },
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    expect.assertions(9)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/124/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/testtest/pulls')
      .reply(200, (uri, req) => {
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/finnp/testtest/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      const transformFunc = await transforms[0]
      const newPkg = JSON.parse(
        transformFunc.transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
      transforms[0].created = true
      const devDependency = newPkg.devDependencies['@finnpauls/dep']
      expect(devDependency).toEqual('^2.0.0')
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '124gke',
      repositoryId: '41',
      type: 'devDependencies',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()

    expect(newJob).toBeFalsy()
    const branch = await repositories.get('41:branch:1234abcd')
    const pr = await repositories.get('41:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('no pull request private repo with free account', async () => {
    const { repositories, payments } = await dbs()
    await repositories.put({
      _id: '46',
      accountId: '125',
      fullName: 'finnp/testtest',
      private: true,
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      },
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
    expect.assertions(2)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/38/access_tokens')
      .optionally()
      .reply(200, () => {
        return { token: 'secret' }
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '125',
      repositoryId: '46',
      type: 'devDependencies',
      version: '2.0.0',

      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('no pull request, too many package.jsons', async () => {
    const { repositories } = await dbs()
    const huuuuuugeMonorepo = {}
    for (let i = 0; i <= 333; i++) {
      huuuuuugeMonorepo[`packages/${i}/package.json`] = {
        'dependencies': {
          '@finnpauls/dep': '^1.0.0'
        },
        greenkeeper: {
          label: 'customlabel'
        }
      }
    }

    await repositories.put({
      _id: 'too-many-packages',
      accountId: '123',
      fullName: 'finnp/test',
      packages: huuuuuugeMonorepo
    })

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '123',
      repositoryId: 'too-many-packages',
      type: 'dependencies',
      version: '2.0.0',

      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    await expect(repositories.get('too-many-packages:branch:1234abcd')).rejects.toThrow('missing')
    await expect(repositories.get('too-many-packages:pr:321')).rejects.toThrow('missing')
  })

  test('no pull request if prerelease', async () => {
    const { repositories } = await dbs()

    await repositories.put({
      _id: 'prerelease',
      accountId: '123',
      fullName: 'finnp/test',
      packages: {
        'package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          },
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '123',
      repositoryId: 'too-many-packages',
      type: 'dependencies',
      version: '2.0.0-beta',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0-beta': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    await expect(repositories.get('prerelease:branch:1234abcd')).rejects.toThrow('missing')
    await expect(repositories.get('prerelease:pr:321')).rejects.toThrow('missing')
  })

  test('comment pr', async () => {
    const { repositories } = await dbs()
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
        accountId: '126',
        fullName: 'finnp/test2',
        files: {
          'package.json': ['package.json'],
          'package-lock.json': [],
          'npm-shrinkwrap.json': [],
          'yarn.lock': []
        },
        packages: {
          'package.json': {
            devDependencies: {
              '@finnpauls/dep2': '^1.0.0'
            },
            greenkeeper: {
              label: 'customlabel'
            }
          }
        }
      })
    ])

    expect.assertions(5)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/41/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test2')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test2/pulls/5')
      .reply(200, {
        state: 'open',
        merged: false
      })
      .post('/repos/finnp/test2/issues/5/comments')
      .reply(201, (uri, req) => {
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
        return {}
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      const transformFunc = await transforms[0]
      const newPkg = JSON.parse(
        transformFunc.transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep2': '^1.0.0'
            }
          })
        )
      )
      transforms[0].created = true
      const devDependency = newPkg.devDependencies['@finnpauls/dep2']
      expect(devDependency).toEqual('^2.0.0')
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep2',
      accountId: '126',
      repositoryId: '43',
      type: 'devDependencies',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    // no new job scheduled
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('43:branch:1234abcd')
    expect(branch.processed).toBeTruthy()
  })

  test('no downgrades', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '44',
      accountId: '127',
      fullName: 'finnp/test',
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      },
      packages: {
        'package.json': {
          devDependencies: {
            '@finnpauls/dep': '^2.0.1'
          },
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    expect.assertions(1)

    nock('https://api.github.com')
      .post('/app/installations/42/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      // this should never be called, cvb should stop before calling it
      expect(true).toBeFalsy()
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '127',
      repositoryId: '44',
      type: 'devDependencies',
      version: '2.0.0',
      oldVersion: '^2.0.1',
      oldVersionResolved: '2.0.1',
      versions: {
        '1.0.0': {},
        '2.0.1': {}
      }
    })
    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('ignore invalid oldVersion', async () => {
    expect.assertions(1)
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      oldVersion: 'invalid/version'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('ignore ignored dependencies', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
    await repositories.put({
      _id: '45',
      accountId: '123',
      fullName: 'finnp/test',
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      },
      packages: {
        'package.json': {
          greenkeeper: {
            ignore: ['a', 'b', 'c']
          }
        }
      }
    })

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'b',
      accountId: '123',
      repositoryId: '45',
      version: '1.0.1',
      oldVersion: '1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('ignore ignored devDependency + empty gk config in repodoc', async () => {
    expect.assertions(2)
    const { repositories } = await dbs()
    await repositories.put({
      _id: '51',
      accountId: '123',
      fullName: 'treasure-data/td-js-sdk',
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      },
      packages: {
        'package.json': {
          greenkeeper: {
            ignore: ['domready', 'karma', 'mocha']
          },
          'devDependencies': {
            'expect.js': '^0.3.1',
            'express': '^4.14.0',
            'glob': '^7.0.5',
            'js-polyfills': '^0.1.34',
            'karma': '1.3.0',
            'karma-browserstack-launcher': '^1.3.0',
            'karma-chrome-launcher': '^2.2.0',
            'karma-firefox-launcher': '^1.0.1',
            'karma-min-reporter': '^0.1.0',
            'karma-mocha': '^1.3.0',
            'karma-safari-launcher': '^1.0.0',
            'karma-webpack': '^2.0.4',
            'mocha': '^2.5.3',
            'parse-domain': '^2.0.0',
            'phantomjs-prebuilt': '^2.1.7',
            'requirejs': '^2.2.0',
            'selenium-standalone': '^5.4.0',
            'simple-mock': '^0.8.0',
            'standard': '^11.0.0',
            'tape': '^4.6.0',
            'uglifyjs': '^2.4.10',
            'uglifyjs-webpack-plugin': '^0.4.6',
            'wd': '^1.5.0',
            'webpack': '^1.13.1'
          },
          'dependencies': {
            'domready': '^0.3.0',
            'global': '^4.3.0',
            'json3': '^3.3.2',
            'jsonp': '0.2.1',
            'lodash-compat': '^3.10.1'
          }
        }
      },
      greenkeeper: {}
    })

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'karma',
      accountId: '123',
      repositoryId: '51',
      type: 'devDependencies',
      version: '2.0.2',
      oldVersion: '1.3.0'
    })

    expect(githubMock.isDone()).toBeTruthy()
    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('lockfile: bails if in range and shrinkwrap', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
    await repositories.put({
      _id: '47',
      accountId: '2323',
      fullName: 'espy/test',
      files: {
        'package.json': ['package.json'],
        'package-lock.json': [],
        'npm-shrinkwrap.json': ['npm-shrinkwrap.json'],
        'yarn.lock': []
      },
      packages: {
        'package.json': {}
      }
    })

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'b',
      accountId: '2323',
      repositoryId: '47',
      version: '1.0.1',
      oldVersion: '^1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('lockfile: runs if in range, has package-lock.json', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: '50',
      accountId: '2323',
      fullName: 'espy/test',
      packages: {
        'package.json': {
          devDependencies: {
            'jest': '1.1.1'
          }
        }
      },
      files: {
        'package.json': ['package.json'],
        'package-lock.json': ['package-lock.json'],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      }
    })
    await npm.put({
      _id: 'jest',
      distTags: {
        latest: '1.2.0'
      },
      versions: {
        '1.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/jest/jest.git'
          }
        },
        '1.1.1': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/jest/jest.git'
          }
        },
        '1.2.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/jest/jest.git'
          }
        }
      }
    })
    expect.assertions(10)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/40/access_tokens')
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
      .post(
        '/repos/espy/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201)
      .post('/repos/espy/test/pulls')
      .reply(200, (uri, req) => {
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
        return {
          id: 1234,
          number: 50,
          state: 'open'
        }
      })
      .post('/repos/espy/test/issues/50/labels')
      .reply(201)

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => async ({ transforms, processLockfiles, repoDoc }) => {
      expect(transforms).toHaveLength(1)
      expect(processLockfiles).toBeTruthy()
      expect(repoDoc).toHaveProperty('files')
      let newPackageJSON = transforms[0].transform(JSON.stringify({
        devDependencies: {
          'jest': '1.1.1'
        }
      }))
      transforms[0].created = true
      expect(transforms[0].path).toEqual('package.json')
      expect(newPackageJSON).toMatchSnapshot()

      return '1234abcd'
    })

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'jest',
      accountId: '2323',
      repositoryId: '50',
      type: 'devDependencies',
      version: '1.2.0',
      oldVersion: '1.1.1',
      oldVersionResolved: '1.1.1',
      versions: {
        '1.0.0': {},
        '1.1.1': {}
      }
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('50:branch:1234abcd')
    expect(branch).toBeTruthy()
    await expect(repositories.get('50:pr:1234')).resolves.not.toThrow('missing')
    expect(githubMock.isDone()).toBeTruthy()
  })

  test('lockfile: runs if in range, has package-lock.json, with old files object format', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: '86',
      accountId: '2323',
      fullName: 'johnlocke/test',
      files: {
        'package.json': true,
        'package-lock.json': true,
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'package.json': {
          devDependencies: {
            'greenkeeper-lockfile': '1.1.1',
            '@finnpauls/dep3': '^2.0.0'
          }
        }
      }
    })

    await npm.put({
      _id: '@finnpauls/dep3',
      distTags: {
        latest: '2.1.0'
      },
      versions: {
        '1.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep3.git'
          }
        },
        '2.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep3.git'
          }
        },
        '2.1.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/finnpauls/dep3.git'
          }
        }
      }
    })
    expect.assertions(4)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/40/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/johnlocke/test')
      .reply(200, {
        default_branch: 'master'
      })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      transforms[0].created = true
      return '1234abcd'
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep3',
      accountId: '2323',
      repositoryId: '86',
      type: 'devDependencies',
      version: '2.1.0',
      oldVersion: '^2.0.0',
      oldVersionResolved: '2.0.0',
      versions: {
        '1.0.0': {},
        '1.1.0': {},
        '2.0.0': {}
      }
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('86:branch:1234abcd')
    expect(branch).toBeTruthy()
    await expect(repositories.get('86:pr:321')).rejects.toThrow('missing')
    expect(githubMock.isDone()).toBeTruthy()
  })

  test('lockfile: runs if in range, package-lock.json has not changed', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: '50_cvb_lockfile',
      accountId: '2323',
      fullName: 'espy/test',
      packages: {
        'package.json': {
          devDependencies: {
            'best': '1.1.1'
          }
        }
      },
      files: {
        'package.json': ['package.json'],
        'package-lock.json': ['package-lock.json'],
        'npm-shrinkwrap.json': [],
        'yarn.lock': []
      }
    })
    await npm.put({
      _id: 'best',
      distTags: {
        latest: '1.2.0'
      },
      versions: {
        '1.0.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/best/best.git'
          }
        },
        '1.1.1': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/best/best.git'
          }
        },
        '1.2.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/best/best.git'
          }
        }
      }
    })
    expect.assertions(8)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/40/access_tokens')
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
      .post(
        '/repos/espy/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201)
      .post('/repos/espy/test/pulls')
      .reply(200, (uri, req) => {
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
        return {
          id: 1234,
          number: 50,
          state: 'open'
        }
      })
      .post('/repos/espy/test/issues/50/labels')
      .reply(201)

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(1)

      let newPackageJSON = transforms[0].transform(JSON.stringify({
        devDependencies: {
          'best': '1.1.1'
        }
      }))
      transforms[0].created = true
      expect(transforms[0].path).toEqual('package.json')
      expect(newPackageJSON).toMatchSnapshot()

      return '1234abcd'
    })

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'best',
      accountId: '2323',
      repositoryId: '50_cvb_lockfile',
      type: 'devDependencies',
      version: '1.2.0',
      oldVersion: '1.1.1',
      oldVersionResolved: '1.1.1',
      versions: {
        '1.0.0': {},
        '1.1.1': {}
      }
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('50_cvb_lockfile:branch:1234abcd')
    expect(branch).toBeTruthy()
    await expect(repositories.get('50_cvb_lockfile:pr:1234')).resolves.not.toThrow('missing')
    expect(githubMock.isDone()).toBeTruthy()
  })

  // If it’s not a monorepo, but the user still defines a group for that single package.json, we still
  // respect its ignore config
  test('no branch with single package.json in default group and ignored dependency', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'ignored-in-group-1',
      accountId: '2323',
      fullName: 'finnp/test',
      enabled: true,
      greenkeeper: {
        'groups': {
          'default': {
            'packages': [
              'package.json'
            ],
            'ignore': [
              'karma',
              'karma-chrome-launcher',
              'karma-coverage-istanbul-reporter'
            ]
          }
        }
      },
      packages: {
        'package.json': {
          dependencies: {
            karma: '5.5.5'
          }
        }
      }
    })

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'karma',
      accountId: '2323',
      repositoryId: 'ignored-in-group-1',
      type: 'dependencies',
      version: '5.5.6',
      oldVersion: '^5.0.0',
      oldVersionResolved: '5.5.5',
      versions: {
        '5.5.6': {
          gitHead: 'deadbeef222'
        }
      }
    })

    expect(newJob).toBeFalsy()
  })
})

/*
  Monorepo section
*/
describe('create version branch for dependencies from monorepos', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    nock.cleanAll()
  })
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    nock.cleanAll()
  })
  const constantDate = new Date('2018-11-19T11:11:11')
  beforeAll(async () => {
    global.Date = class extends Date {
      constructor () {
        super()
        return constantDate
      }
    }
    const { installations, npm } = await dbs()
    await installations.put({
      _id: 'mono-123',
      installation: 1
    })

    await npm.put({
      _id: 'colors',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/colors' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/colors' } }
      }
    })
    // There is no repo URL in here to test whether the dependencyURL gets created correctly
    // should be an npm url for this package
    await npm.put({
      _id: 'colors-blue',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      }
    })
    await npm.put({
      _id: 'colors-red',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/colors-red' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/colors-red' } }
      }
    })

    await npm.put({
      _id: 'flowers',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/flowers' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/flowers' } }
      }
    })
    await npm.put({
      _id: 'flowers-blue',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-blue' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-blue' } }
      }
    })
    await npm.put({
      _id: 'flowers-red',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-red' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-red' } }
      }
    })
    await npm.put({
      _id: 'flowers-green',
      distTags: {
        latest: '2.0.0'
      },
      versions: {
        '1.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-green' } },
        '2.0.0': { repository: { url: 'git+https://github.com/orgname/flowers-green' } }
      }
    })
  })

  afterAll(async () => {
    const { installations, repositories, npm } = await dbs()
    await Promise.all([
      removeIfExists(installations, 'mono-123'),
      removeIfExists(npm, 'colors', 'colors-blue', 'colors-red', 'colors-green'),
      removeIfExists(npm, 'flowers', 'flowers-blue', 'flowers-red', 'flowers-green'),
      removeIfExists(npm, 'numbers', 'numbers-three', 'numbers-four'),
      removeIfExists(repositories, 'mono-1', 'mono-1-ignored', 'mono-deps-diff', 'mono-2'),
      removeIfExists(repositories, 'mono-1:branch:1234abcd', 'mono-1:pr:321', 'mono-1-ignored:branch:1234abcd', 'mono-1-ignored:pr:321', 'mono-2:branch:1234abcd', 'mono-2:pr:321', 'mono-nuclear-100', 'mono-nuclear-100:branch:1234abcd', 'mono-nuclear-babel', 'mono-nuclear-babel:branch:superSha'),
      removeIfExists(repositories, '1:branch:2222abcd', '1:pr:3210')
    ])
  })

  test('new pull request with ignored dependency', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mono-1-ignored',
      accountId: 'mono-123',
      fullName: 'finnp/test',
      enabled: true,
      greenkeeper: {
        ignore: ['colors-blue']
      },
      packages: {
        'package.json': {
          dependencies: {
            pouchdb: '1.0.0',
            'pouchdb-core': '1.0.0',
            'colors-blue': '1.0.0',
            bulldog: '1.0.0'
          },
          devDependencies: {
            colors: '1.0.0'
          }
        }
      }
    })

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, (uri, req) => {
        console.log(uri)
        console.log(JSON.parse(req).body)
        // pull request created
        expect(JSON.parse(req).body).toMatchSnapshot()
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
      .post('/repos/finnp/test/issues/66/labels')
      .reply(201, {})
      .post(
        '/repos/finnp/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(1)
      const transform = await transforms[0]
      let result = JSON.parse(transform.transform(JSON.stringify({
        dependencies: {
          pouchdb: '1.0.0',
          'pouchdb-core': '1.0.0',
          'colors-blue': '1.0.0',
          bulldog: '1.0.0'
        },
        devDependencies: {
          colors: '1.0.0'
        }
      })))
      transforms[0].created = true
      expect(result.dependencies['colors-blue']).toBe('1.0.0')
      expect(result.devDependencies['colors']).toBe('2.0.0')
      return '1234abcd'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          colors: ['colors', 'colors-blue', 'colors-red']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'colors-red',
      accountId: 'mono-123',
      repositoryId: 'mono-1-ignored',
      type: 'dependencies',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {
          gitHead: 'deadbeef100'
        },
        '2.0.0': {
          gitHead: 'deadbeef222',
          repository: {
            url: 'https://github.com/colors/monorepo'
          }
        }
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-1-ignored:branch:1234abcd')
    const pr = await repositories.get('mono-1-ignored:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/monorepo.colors-20181119111111')

    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('new pull request', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mono-1',
      accountId: 'mono-123',
      fullName: 'finnp/test',
      enabled: true,
      packages: {
        'package.json': {
          dependencies: {
            pouchdb: '1.0.0',
            'pouchdb-core': '1.0.0',
            'colors-blue': '1.0.0',
            bulldog: '1.0.0'
          },
          devDependencies: {
            colors: '1.0.0'
          }
        }
      }
    })

    expect.assertions(11)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, (req, res) => {
        expect(JSON.parse(res).body).toMatchSnapshot()
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
      .post('/repos/finnp/test/issues/66/labels')
      .reply(201, () => {
        return {}
      })
      .post(
        '/repos/finnp/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(2)
      const transform1 = await transforms[0]
      const transform2 = await transforms[1]
      let result = transform1.transform(JSON.stringify({
        dependencies: {
          pouchdb: '1.0.0',
          'pouchdb-core': '1.0.0',
          'colors-blue': '1.0.0',
          bulldog: '1.0.0'
        },
        devDependencies: {
          colors: '1.0.0'
        }
      }))
      transforms[0].created = true
      transforms[1].created = true
      result = JSON.parse(transform2.transform(result))
      expect(result.dependencies['colors-blue']).toBe('2.0.0')
      expect(result.devDependencies['colors']).toBe('2.0.0')
      return '1234abcd'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          colors: ['colors', 'colors-blue', 'colors-red']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'colors-red',
      accountId: 'mono-123',
      repositoryId: 'mono-1',
      type: 'dependencies',
      version: '2.0.0',

      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {
          gitHead: 'deadbeef100'
        },
        '2.0.0': {
          gitHead: 'deadbeef222',
          repository: {
            url: 'https://github.com/colors/monorepo'
          }
        }
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-1:branch:1234abcd')
    const pr = await repositories.get('mono-1:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/monorepo.colors-20181119111111')

    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('new pull request with different versions, skipping one unchanged package', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: 'mono-deps-diff',
      accountId: 'mono-123',
      fullName: 'finnp/numbers',
      enabled: true,
      packages: {
        'package.json': {
          dependencies: {
            pouchdb: '1.0.0',
            'pouchdb-core': '1.0.0',
            'numbers-three': '1.5.0', // should be skipped, as it did not change
            'numbers-four': '1.2.0',
            bulldog: '1.0.0'
          },
          devDependencies: {
            numbers: '2.1.0'
          }
        }
      }
    })

    await npm.put({
      _id: 'numbers',
      distTags: {
        latest: '2.2.0'
      },
      versions: {
        '2.1.0': {},
        '2.2.0': {}
      }
    })
    await npm.put({
      _id: 'numbers-three',
      distTags: {
        latest: '1.5.0'
      },
      versions: {
        '1.2.0': {},
        '1.3.0': {},
        '1.4.0': {},
        '1.5.0': {}
      }
    })
    await npm.put({
      _id: 'numbers-four',
      distTags: {
        latest: '1.3.0'
      },
      versions: {
        '1.2.0': {},
        '1.3.0': {}
      }
    })
    expect.assertions(11)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/numbers/pulls')
      .reply(200, (req, res) => {
        // pull request created
        expect(JSON.parse(res).body).toMatchSnapshot()
        return {
          id: 321,
          number: 66,
          state: 'open'
        }
      })
      .get('/repos/finnp/numbers')
      .reply(200, {
        default_branch: 'master'
      })
      .post('/repos/finnp/numbers/issues/66/labels')
      .reply(201, () => {
        return {}
      })
      .post(
        '/repos/finnp/numbers/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(2)
      const transform1 = await transforms[0]
      const transform2 = await transforms[1]
      let result = transform1.transform(JSON.stringify({
        dependencies: {
          pouchdb: '1.0.0',
          'pouchdb-core': '1.0.0',
          'numbers-three': '1.5.0',
          'numbers-four': '1.2.0',
          bulldog: '1.0.0'
        },
        devDependencies: {
          numbers: '2.1.0'
        }
      }))
      transforms[0].created = true
      transforms[1].created = true
      result = JSON.parse(transform2.transform(result))
      expect(result.dependencies['numbers-three']).toBe('1.5.0')
      expect(result.devDependencies['numbers']).toBe('2.2.0')
      return '1234abcd'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          numbers: ['numbers', 'numbers-three', 'numbers-four']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'numbers',
      accountId: 'mono-123',
      repositoryId: 'mono-deps-diff',
      type: 'dependencies',
      version: '2.2.0',

      oldVersion: '2.1.0',
      oldVersionResolved: '2.1.0',
      versions: {
        '1.0.0': {
          gitHead: 'deadbeef100'
        },
        '2.1.0': {
          gitHead: 'deadbeef222',
          repository: {
            url: 'https://github.com/numbers/monorepo'
          }
        }
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-deps-diff:branch:1234abcd')
    const pr = await repositories.get('mono-deps-diff:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/monorepo.numbers-20181119111111')

    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })

  test('new pull request with group of dependencies', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'mono-2',
      accountId: 'mono-123',
      fullName: 'finnp/test',
      enabled: true,
      packages: {
        'package.json': {
          dependencies: {
            'flowers-blue': '1.0.0',
            'flowers-red': '1.0.0',
            'flowers-green': '1.0.0'
          },
          devDependencies: {
            flowers: '1.0.0',
            'flowers-blue': '1.0.0'
          }
        }
      }
    })

    expect.assertions(17)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, (url, payload) => {
        const PRBody = JSON.parse(payload).body
        expect(PRBody).toMatchSnapshot()
        return {
          id: 321,
          number: 77,
          state: 'open'
        }
      })
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .post('/repos/finnp/test/issues/77/labels')
      .reply(201, () => {
        return {}
      })
      .post(
        '/repos/finnp/test/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(4)

      const transform0 = await transforms[0]
      expect(transform0.message).toEqual('chore(package): update flowers to version 2.0.0')

      const transform1 = await transforms[1]
      expect(transform1.message).toEqual('fix(package): update flowers-blue to version 2.0.0')

      const transform2 = await transforms[2]
      expect(transform2.message).toEqual('fix(package): update flowers-red to version 2.0.0')

      const transform3 = await transforms[3]
      expect(transform3.message).toEqual('fix(package): update flowers-green to version 2.0.0')

      let input = {
        dependencies: {
          'flowers-blue': '1.0.0',
          'flowers-red': '1.0.0',
          'flowers-green': '1.0.0'
        },
        devDependencies: {
          'flowers-blue': '1.0.0',
          flowers: '1.0.0'
        }
      }

      let result = transform0.transform(JSON.stringify(input))

      result = transform1.transform(result)
      result = transform2.transform(result)
      result = transform3.transform(result)

      result = JSON.parse(result)
      transforms[0].created = true
      transforms[1].created = true
      transforms[2].created = true
      transforms[3].created = true
      expect(result.dependencies['flowers-blue']).toBe('2.0.0')
      expect(result.dependencies['flowers-red']).toBe('2.0.0')
      expect(result.dependencies['flowers-green']).toBe('2.0.0')
      expect(result.devDependencies['flowers']).toBe('2.0.0')
      return '1234abcd'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          flowers: ['flowers', 'flowers-blue', 'flowers-red', 'flowers-green']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'flowers-red',
      accountId: 'mono-123',
      repositoryId: 'mono-2',
      type: 'dependencies',
      version: '2.0.0',

      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {
          gitHead: 'deadbeef100'
        },
        '2.0.0': {
          gitHead: 'deadbeef222',
          repository: {
            url: 'https://github.com/colors/monorepo'
          }
        },
        '3.0.0': {
          gitHead: 'deadbeef333',
          repository: {
            url: 'https://github.com/colors/monorepo'
          }
        }
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-2:branch:1234abcd')
    const pr = await repositories.get('mono-2:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/monorepo.flowers-20181119111111')

    expect(pr.number).toBe(77)
    expect(pr.state).toEqual('open')
  })

  test('unused dep release from used monorepo dep, no PR because all updates are in-range', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: 'mono-nuclear-100',
      accountId: 'mono-123',
      fullName: 'nukeop/nuclear',
      enabled: true,
      packages: {
        'package.json': {
          devDependencies: {
            'enzyme': '^3.4.2',
            'enzyme-adapter-react-16': '^1.1.0'
          }
        }
      }
    })

    await npm.put({
      _id: 'enzyme',
      distTags: {
        latest: '3.4.4'
      },
      versions: {
        '3.4.2': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '3.4.3': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '3.4.4': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        }
      }
    })
    await npm.put({
      _id: 'enzyme-adapter-react-16',
      distTags: {
        latest: '1.2.0'
      },
      versions: {
        '1.1.1': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.2.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        }
      }
    })
    // This package is updated and should trigger an update for the enzyme group, but shouldn’t
    // have a commit itself, since it isn’t depended upon
    await npm.put({
      _id: 'enzyme-adapter-utils',
      distTags: {
        latest: '1.6.0'
      },
      versions: {
        '1.2.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.3.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.4.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.5.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        },
        '1.6.0': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/airbnb/enzyme.git'
          }
        }
      }
    })

    expect.assertions(8)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/nukeop/nuclear')
      .reply(200, {
        default_branch: 'master'
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(2)
      let result = await transforms[0].transform(JSON.stringify({
        devDependencies: {
          'enzyme': '^3.4.2',
          'enzyme-adapter-react-16': '^1.1.0'
        }
      }))
      transforms[0].created = true
      result = await JSON.parse(transforms[1].transform(result))
      transforms[1].created = true
      expect(result.devDependencies['enzyme']).toBe('^3.4.4')
      expect(result.devDependencies['enzyme-adapter-react-16']).toBe('^1.2.0')
      return '1234abcd'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          enzyme: [
            'enzyme',
            'enzyme-adapter-react-13',
            'enzyme-adapter-react-14',
            'enzyme-adapter-react-15.4',
            'enzyme-adapter-react-15',
            'enzyme-adapter-react-16',
            'enzyme-adapter-utils',
            'enzyme-adapter-react-helper'
          ]
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    // This is what registry-change passes in for this buggy PR
    // We might be able to leave this as-is and just handle things in cvb correctly.
    const newJob = await createVersionBranch({
      dependency: 'enzyme-adapter-utils',
      accountId: 'mono-123',
      repositoryId: 'mono-nuclear-100',
      plan: 'free',
      type: 'devDependencies',
      version: '1.6.0',
      oldVersion: '^3.3.0',
      oldVersionResolved: undefined,
      versions: {
        '1.6.0': { gitHead: 'wau' },
        '1.5.0': { gitHead: 'woof' }
      }
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-nuclear-100:branch:1234abcd')
    await expect(repositories.get('mono-nuclear-100:pr:321')).rejects.toThrow('missing')

    expect(branch.processed).toBeFalsy() // I think
    expect(branch.head).toEqual('greenkeeper/monorepo.enzyme-20181119111111')
  })

  test('create branch name with prerelease suffix if user had prerelases in package.json', async () => {
    const { repositories, npm } = await dbs()
    await repositories.put({
      _id: 'mono-nuclear-babel',
      accountId: 'mono-123',
      fullName: 'nukeop/nuclear',
      enabled: true,
      packages: {
        'package.json': {
          devDependencies: {
            '@babel/core': '^7.0.0-rc.1',
            '@babel/preset-env': '^7.0.0-rc.1'
          }
        }
      }
    })

    await npm.put({
      _id: '@babel/core',
      distTags: {
        latest: '7.0.0-rc.2'
      },
      versions: {
        '7.0.0-rc.1': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/babel/babel.git'
          }
        },
        '7.0.0-rc.2': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/babel/babel.git'
          }
        }
      }
    })

    await npm.put({
      _id: '@babel/preset-env',
      distTags: {
        latest: '7.0.0-rc.2'
      },
      versions: {
        '7.0.0-rc.1': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/babel/babel.git'
          }
        },
        '7.0.0-rc.2': {
          'repository': {
            'type': 'git',
            'url': 'git+https://github.com/babel/babel.git'
          }
        }
      }
    })

    expect.assertions(8)

    const githubMock = nock('https://api.github.com')
      .post('/app/installations/1/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/nukeop/nuclear')
      .reply(200, {
        default_branch: 'master'
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(2)
      let result = await transforms[0].transform(JSON.stringify({
        devDependencies: {
          '@babel/core': '^7.0.0-rc.1',
          '@babel/preset-env': '^7.0.0-rc.1'
        }
      }))
      transforms[0].created = true
      result = await JSON.parse(transforms[1].transform(result))
      transforms[1].created = true
      expect(result.devDependencies['@babel/core']).toBe('^7.0.0-rc.2')
      expect(result.devDependencies['@babel/preset-env']).toBe('^7.0.0-rc.2')
      return 'superSha'
    })

    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          babel7: [
            '@babel/core',
            '@babel/preset-env',
            '@babel/tower-of'
          ]
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    // This is what registry-change passes in for this buggy PR
    // We might be able to leave this as-is and just handle things in cvb correctly.
    const newJob = await createVersionBranch({
      dependency: '@babel/core',
      accountId: 'mono-123',
      repositoryId: 'mono-nuclear-babel',
      plan: 'free',
      type: 'devDependencies',
      version: '7.0.0-rc.2',
      oldVersion: '^7.0.0-rc.1',
      oldVersionResolved: undefined
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const branch = await repositories.get('mono-nuclear-babel:branch:superSha')
    await expect(repositories.get('mono-nuclear-babel:pr:321')).rejects.toThrow('missing')

    expect(branch.processed).toBeFalsy() // I think
    expect(branch.head).toEqual('greenkeeper/monorepo.babel7-20181119111111')
  })
})
