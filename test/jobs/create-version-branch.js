const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const { cleanCache } = require('../helpers/module-cache-helpers')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

jest.setTimeout(10000)

describe('create version brach', () => {
  beforeEach(() => {
    delete process.env.IS_ENTERPRISE
    cleanCache('../../lib/env')
    jest.resetModules()
    jest.clearAllMocks()
  })
  beforeAll(async () => {
    const { installations } = await dbs()
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
  })

  test('new pull request', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '1',
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
    expect.assertions(13)

    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/test/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
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

    jest.mock('../../lib/get-infos', () => ({
      installationId, dependency, version, diffBase, versions
    }) => {
      // used get-infos
      expect(true).toBeTruthy()

      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(37)
      expect(dependency).toEqual('@finnpauls/dep')
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })
    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transform }) => {
      const newPkg = JSON.parse(
        transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
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
    expect.assertions(12)

    const githubMock = nock('https://api.github.com')
      .post('/installations/38/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/testtest/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
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

    jest.mock('../../lib/get-infos', () => ({ installationId, dependency, version, diffBase, versions }) => {
      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(38)
      expect(dependency).toEqual('@finnpauls/dep')
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })
    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transform }) => {
      const newPkg = JSON.parse(
        transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
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
    const { repositories } = await dbs()

    await repositories.put({
      _id: '41',
      accountId: '124gke',
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
    expect.assertions(13)

    const githubMock = nock('https://api.github.com')
      .post('/installations/124/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/finnp/testtest/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
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

    jest.mock('../../lib/get-infos', () => ({ installationId, dependency, version, diffBase, versions }) => {
      // used get-infos
      expect(true).toBeTruthy()

      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(124)
      expect(dependency).toEqual('@finnpauls/dep')
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))

    jest.mock('../../lib/create-branch', () => ({ transform }) => {
      const newPkg = JSON.parse(
        transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep': '^1.0.0'
            }
          })
        )
      )
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
    expect.assertions(1)

    const githubMock = nock('https://api.github.com')
      .post('/installations/38/access_tokens')
      .optionally()
      .reply(200, () => {
        return { token: 'secret' }
      })

    jest.mock('../../lib/get-infos', () => () => {
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })
    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transform }) => '1234abcd')
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
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
    // no new job scheduled
    expect(newJob).toBeFalsy()
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
        packages: {
          'package.json': {
            greenkeeper: {
              label: 'customlabel'
            }
          }
        }
      })
    ])

    expect.assertions(9)

    const githubMock = nock('https://api.github.com')
      .post('/installations/41/access_tokens')
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
      .post('/repos/finnp/test2/issues/5/comments')
      .reply(201, () => {
        // comment created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-infos', () => ({ installationId, dependency, version, diffBase, versions }) => {
      // used get-infos
      expect(true).toBeTruthy()

      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(41)
      expect(dependency).toEqual('@finnpauls/dep2')
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))

    jest.mock('../../lib/create-branch', () => ({ transform }) => {
      const newPkg = JSON.parse(
        transform(
          JSON.stringify({
            devDependencies: {
              '@finnpauls/dep2': '^1.0.0'
            }
          })
        )
      )
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
      packages: {
        'package.json': {
          greenkeeper: {
            label: 'customlabel'
          }
        }
      }
    })
    expect.assertions(2)

    const githubMock = nock('https://api.github.com')
      .post('/installations/42/access_tokens')
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

    jest.mock('../../lib/create-branch', () => ({ transform }) => {
      const newPkg = transform(
        JSON.stringify({
          devDependencies: {
            '@finnpauls/dep': '^2.0.1'
          }
        })
      )
      // abort on downgrade
      expect(newPkg).toBeFalsy()
    })
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '127',
      repositoryId: '44',
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
    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('ignore invalid oldVersion', async () => {
    expect.assertions(1)
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      distTag: 'latest',
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
      distTag: 'latest',
      accountId: '123',
      repositoryId: '45',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('bails if in range and shrinkwrap', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
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

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '47',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('bails if in range and project lockfile and no gk-lockfile', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
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

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '48',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('bails if in range and project lockfile, has gk-lockfile, but onlyUpdateLockfilesIfOutOfRange is true', async () => {
    expect.assertions(1)

    const { repositories } = await dbs()
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

    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
      dependency: 'b',
      distTag: 'latest',
      accountId: '2323',
      repositoryId: '49',
      distTags: {
        latest: '1.0.1'
      },
      oldVersion: '^1.0.0'
    })

    // no new job scheduled
    expect(newJob).toBeFalsy()
  })

  test('runs if in range, has project lockfile, has gk-lockfile', async () => {
    const { repositories } = await dbs()
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
    expect.assertions(5)

    const githubMock = nock('https://api.github.com')
      .post('/installations/40/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/espy/test/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
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

    jest.mock('../../lib/get-infos', () => () => {
      return {
        dependencyLink: '[]()',
        release: 'the release',
        diffCommits: 'commits...'
      }
    })

    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => ({ transform }) => '1234abcd')
    const createVersionBranch = require('../../jobs/create-version-branch')

    const newJob = await createVersionBranch({
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
    // no new job scheduled
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('50:branch:1234abcd')
    const pr = await repositories.get('50:pr:321')

    expect(branch.processed).toBeTruthy()

    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
  })
})

afterAll(async () => {
  const { installations, repositories, payments } = await dbs()

  await Promise.all([
    removeIfExists(installations, '123', '124', '124gke', '125', '126', '127', '2323'),
    removeIfExists(payments, '124', '125'),
    removeIfExists(repositories, '41', '42', '43', '44', '45', '46', '47', '48', '49', '50'),
    removeIfExists(repositories, '41:branch:1234abcd', '41:pr:321', '42:branch:1234abcd', '43:branch:1234abcd', '50:branch:1234abcd', '50:pr:321')
  ])
})
