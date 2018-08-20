const nock = require('nock')
const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create-group-version-branch', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    nock.cleanAll()
  })

  beforeAll(async () => {
    const { installations, repositories } = await dbs()
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
    const huuuuuugeMonorepo = {}
    for (let i = 0; i <= 333; i++) {
      huuuuuugeMonorepo[`${i}/package.json`] = {
        'dependencies': {
          react: '1.0.0'
        },
        greenkeeper: {
          label: 'customlabel'
        }
      }
    }
    await repositories.put({
      _id: 'too-many-packages',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages',
      packages: huuuuuugeMonorepo
    })
    await repositories.put({
      _id: 'prerelease',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages',
      packages: huuuuuugeMonorepo
    })
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
    await repositories.put({
      _id: '123-monorepo-monorepo-release',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages',
      packages: {
        'package.json': {
          dependencies: {
            'pouchdb': '1.0.0'
          },
          devDependencies: {
            'pouchdb-core': '1.0.0'
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
            'pouchdb-core': '1.0.0',
            'pouchdb-adapter-utils': '1.0.0',
            'pouchdb': '1.0.0'
          }
        }
      }
    })
    await repositories.put({
      _id: '123-monorepo-monorepo-release-ignore',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-two-packages',
      packages: {
        'package.json': {
          dependencies: {
            pouchdb: '1.0.0',
            'pouchdb-core': '1.0.0'
          },
          greenkeeper: {
            'groups': {
              'default': {
                ignore: ['pouchdb-core'],
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
            pouchdb: '1.0.0',
            'pouchdb-core': '1.0.0'
          }
        }
      }
    })
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()

    await Promise.all([
      removeIfExists(installations, '123-two-packages', '123-two-packages-different-types', '123-dep-ignored-on-group-level'),
      removeIfExists(repositories, '123-monorepo', '123-monorepo-different-types', '123-monorepo-dep-ignored-on-group-level', '123-monorepo-monorepo-release', 'too-many-packages', 'prerelease'),
      removeIfExists(repositories, '123-monorepo:branch:1234abcd', '123-monorepo:pr:321', '123-monorepo-different-types:branch:1234abcd', '123-monorepo-different-types:pr:321', '123-monorepo-old-pr')
    ])
  })

  test('new pull request, 1 group, 2 packages, same dependencyType', async () => {
    expect.assertions(20)

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
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).title).toEqual('Update react in group default to the latest version 🚀')
        expect(JSON.parse(requestBody).head).toEqual('greenkeeper/default/monorepo.react-2.0.0')
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
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
      expect(installationId).toBe(87)
      expect(dependency).toEqual('react')
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
      return '1234abcd'
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')
    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo',
      types: [
        {type: 'dependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      version: '2.0.0',
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
    expect(newJob).toBeFalsy()
    const { repositories } = await dbs()
    const branch = await repositories.get('123-monorepo:branch:1234abcd')
    const pr = await repositories.get('123-monorepo:pr:321')
    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/default/monorepo.react-2.0.0')
    expect(branch.repositoryId).toEqual('123-monorepo')
    expect(branch.accountId).toEqual('123-two-packages')
    expect(branch.dependencyType).toEqual('dependencies')
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
    expect(pr.repositoryId).toEqual('123-monorepo')
    expect(pr.accountId).toEqual('123-two-packages')
  })

  test('new pull request, 1 group, 2 packages, different dependencyType', async () => {
    expect.assertions(20)

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
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).title).toEqual('Update react in group default to the latest version 🚀')
        expect(JSON.parse(requestBody).head).toEqual('greenkeeper/default/monorepo.react-2.0.0')
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
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
      expect(installationId).toBe(88)
      expect(dependency).toEqual('react')
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
      return '1234abcd'
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-two-packages-different-types',
      repositoryId: '123-monorepo-different-types',
      types: [
        {type: 'devDependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      version: '2.0.0',
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
    expect(newJob).toBeFalsy()
    const { repositories } = await dbs()
    const branch = await repositories.get('123-monorepo-different-types:branch:1234abcd')
    const pr = await repositories.get('123-monorepo-different-types:pr:321')
    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/default/monorepo.react-2.0.0')
    expect(branch.repositoryId).toEqual('123-monorepo-different-types')
    expect(branch.accountId).toEqual('123-two-packages-different-types')
    expect(branch.dependencyType).toEqual('dependencies')
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
    expect(pr.repositoryId).toEqual('123-monorepo-different-types')
    expect(pr.accountId).toEqual('123-two-packages-different-types')
  })

  test('no pull request, 1 group, 1 packages that is ignored on group level', async () => {
    expect.assertions(1)
    const { repositories, installations } = await dbs()

    await installations.put({
      _id: '123-dep-ignored-on-group-level',
      installation: 2332,
      plan: 'free'
    })

    await repositories.put({
      _id: '123-monorepo-dep-ignored-on-group-level',
      enabled: true,
      type: 'repository',
      fullName: 'hans/monorepo',
      accountId: '123-dep-ignored-on-group-level',
      packages: {
        'package.json': {
          dependencies: {
            react: '1.0.0'
          }
        },
        'backend/package.json': {
          devDependencies: {
            react: '1.0.0'
          }
        }
      },
      greenkeeper: {
        'groups': {
          'backend': {
            ignore: [
              'react'
            ],
            'packages': [
              'package.json',
              'backend/package.json'
            ]
          }
        }
      }
    })

    nock('https://api.github.com')
      .post('/installations/2332/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo')
      .reply(200, () => {
        // Job should have already stopped!
        expect(true).toBeFalsy()
      })

    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-dep-ignored-on-group-level',
      repositoryId: '123-monorepo-dep-ignored-on-group-level',
      types: [
        {type: 'devDependencies', filename: 'backend/package.json'}
      ],
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: {
        'backend': {
          ignore: [
            'react'
          ],
          'packages': [
            'package.json',
            'backend/package.json'
          ]
        }
      },
      monorepo: [
        { id: '123-monorepo-dep-ignored-on-group-level',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-dep-ignored-on-group-level',
            filename: 'backend/package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } } ]
    })

    expect(newJob).toBeFalsy()
  })

  test('no pull request, too many package.jsons', async () => {
    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)

    jest.mock('../../lib/get-infos', () => () => ({
      dependencyLink: '[]()',
      release: 'the release',
      diffCommits: 'commits...'
    }))
    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => () => '1234abcd')
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-two-packages',
      repositoryId: 'too-many-packages',
      types: [
        {type: 'dependencies', filename: '22/package.json'},
        {type: 'dependencies', filename: '11/package.json'}],
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: {
        'default': {
          'packages': [
            '11/package.json',
            '22/package.json'
          ]
        }
      },
      monorepo: [
        { id: 'too-many-packages',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: '11/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: 'too-many-packages',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: '22/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } } ]
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const { repositories } = await dbs()
    await expect(repositories.get('too-many-packages:branch:1234abcd')).rejects.toThrow('missing')
    await expect(repositories.get('too-many-packages:pr:321')).rejects.toThrow('missing')
  })

  test('no pull request if prerelease', async () => {
    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)

    jest.mock('../../lib/get-infos', () => () => ({
      dependencyLink: '[]()',
      release: 'the release',
      diffCommits: 'commits...'
    }))
    jest.mock('../../lib/get-diff-commits', () => () => ({
      html_url: 'https://github.com/lkjlsgfj/',
      total_commits: 0,
      behind_by: 0,
      commits: []
    }))
    jest.mock('../../lib/create-branch', () => () => '1234abcd')
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-two-packages',
      repositoryId: 'prerelease',
      types: [
        {type: 'dependencies', filename: '22/package.json'},
        {type: 'dependencies', filename: '11/package.json'}],
      distTag: 'latest',
      distTags: {
        latest: '2.0.0-prerelease'
      },
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0-prerelease': {}
      },
      group: {
        'default': {
          'packages': [
            '11/package.json',
            '22/package.json'
          ]
        }
      },
      monorepo: [
        { id: 'prerelease',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: '11/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: 'too-many-packages',
          key: 'react',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: '22/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } } ]
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const { repositories } = await dbs()
    await expect(repositories.get('prerelease:branch:1234abcd')).rejects.toThrow('missing')
    await expect(repositories.get('prerelease:pr:321')).rejects.toThrow('missing')
  })

  test('new pull request, 1 group, 2 packages, same dependencyType, old PR exists', async () => {
    expect.assertions(13)
    const { repositories } = await dbs()
    await repositories.put({
      _id: '123-monorepo-old-pr',
      type: 'pr',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo',
      version: '2.0.0',
      oldVersion: '^1.0.0',
      dependency: 'react',
      initial: false,
      merged: false,
      number: 1,
      state: 'open',
      group: 'default'
    })

    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/hans/monorepo')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/hans/monorepo/pulls/1')
      .reply(200, {
        state: 'open',
        merged: false
      })
      .post('/repos/hans/monorepo/issues/1/comments')
      .reply(201, () => {
        // comment created
        // we only want a comment on the existing open PR, not a new PR
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
      expect(installationId).toBe(87)
      expect(dependency).toEqual('react')
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
      return '1234abcd'
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'react',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo',
      types: [
        {type: 'dependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      version: '2.0.0',
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

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('123-monorepo:branch:1234abcd')
    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/default/monorepo.react-2.0.0')
    expect(branch.repositoryId).toEqual('123-monorepo')
    expect(branch.accountId).toEqual('123-two-packages')
    expect(branch.dependencyType).toEqual('dependencies')
  })

  test('monorepo release: new pull request, 1 group, 2 packages, same dependencyType', async () => {
    expect.assertions(34)
    const { npm } = await dbs()
    await npm.put({
      _id: 'pouchdb-core',
      distTags: {
        latest: '2.0.0'
      }
    })
    await npm.put({
      _id: 'pouchdb',
      distTags: {
        latest: '2.0.0'
      }
    })

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
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).title).toEqual('Update pouchdb in group default to the latest version 🚀')
        expect(JSON.parse(requestBody).head).toEqual('greenkeeper/default/monorepo.pouchdb-2.0.0')
        expect(JSON.parse(requestBody).body).toMatch(`Current Version`)
        expect(JSON.parse(requestBody).body).toMatch(`1.0.0`)

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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-infos', () => ({ installationId, dependency, monorepoGroupName, version, diffBase, versions }) => {
      // used get-infos
      expect(true).toBeTruthy()

      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(87)
      expect(monorepoGroupName).toEqual('pouchdb')
      return {
        dependencyLink: '[pouchdb]()',
        release: '2.0.0',
        diffCommits: `<details>
         <summary>Commits</summary>
         body <a href="https://urls.greenkeeper.io/greenkeeperio/greenkeeper">
       </details>`
      }
    })
    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(5)

      const transform0 = await transforms[0]
      expect(transform0.message).toEqual('fix(package): update pouchdb to version 2.0.0')

      const transform1 = await transforms[1]
      expect(transform1.message).toEqual('fix(package): update pouchdb to version 2.0.0')

      const transform2 = await transforms[2]
      expect(transform2.message).toEqual('fix(package): update pouchdb-adapter-utils to version 2.0.0')

      const transform3 = await transforms[3]
      expect(transform3.message).toEqual('chore(package): update pouchdb-core to version 2.0.0')

      const transform4 = await transforms[4]
      expect(transform4.message).toEqual('fix(package): update pouchdb-core to version 2.0.0')

      let input = {
        dependencies: {
          'pouchdb': '1.0.0'
        },
        devDependencies: {
          'pouchdb-core': '1.0.0'
        },
        path: 'package.json'
      }
      let input2 = {
        dependencies: {
          'pouchdb': '1.0.0',
          'pouchdb-core': '1.0.0',
          'pouchdb-adapter-utils': '1.0.0'
        },
        path: 'backend/package.json'
      }

      let result = transform0.transform(JSON.stringify(input))
      result = transform3.transform(result)

      let result2 = transform1.transform(JSON.stringify(input2))
      result2 = transform2.transform(result2)
      result2 = transform4.transform(result2)

      result = JSON.parse(result)
      result2 = JSON.parse(result2)

      expect(result.dependencies['pouchdb']).toBe('2.0.0')
      expect(result.devDependencies['pouchdb-core']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb-core']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb-adapter-utils']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb']).toBe('2.0.0')
      return '1234abcd'
    })
    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          pouchdb: ['pouchdb', 'pouchdb-core', 'pouchdb-adapter-utils']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'pouchdb-adapter-utils',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo-monorepo-release',
      types: [
        {type: 'dependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'},
        {type: 'devDependencies', filename: 'package.json'}
      ],
      version: '2.0.0',
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
        { id: '123-monorepo-monorepo-release',
          key: 'pouchdb-core',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo-monorepo-release',
          key: 'pouchdb',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo-monorepo-release',
          key: 'pouchdb-adapter-utils',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'backend/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' }
        }
      ]
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()

    const { repositories } = await dbs()
    const branch = await repositories.get('123-monorepo-monorepo-release:branch:1234abcd')
    const pr = await repositories.get('123-monorepo-monorepo-release:pr:321')

    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/default/monorepo.pouchdb-2.0.0')
    expect(branch.repositoryId).toEqual('123-monorepo-monorepo-release')
    expect(branch.accountId).toEqual('123-two-packages')
    expect(branch.dependencyType).toEqual('dependencies')
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
    expect(pr.repositoryId).toEqual('123-monorepo-monorepo-release')
    expect(pr.accountId).toEqual('123-two-packages')
  })

  test('monorepo release: new pull request, 1 group, 2 packages, same dependencyType with ignored dependency', async () => {
    expect.assertions(21)

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
        // pull request created
        expect(true).toBeTruthy()
        expect(JSON.parse(requestBody).title).toEqual('Update pouchdb in group default to the latest version 🚀')
        expect(JSON.parse(requestBody).head).toEqual('greenkeeper/default/monorepo.pouchdb-2.0.0')
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
        // label created
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/hans/monorepo/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201, () => {
        // status created
        expect(true).toBeTruthy()
        return {}
      })

    jest.mock('../../lib/get-infos', () => ({
      installationId, dependency, monorepoGroupName, version, diffBase, versions
    }) => {
      // used get-infos
      expect(true).toBeTruthy()

      expect(versions).toEqual({
        '1.0.0': {},
        '2.0.0': {}
      })

      expect(version).toEqual('2.0.0')
      expect(installationId).toBe(87)
      expect(monorepoGroupName).toEqual('pouchdb')
      return {
        dependencyLink: '[pouchdb]()',
        release: '2.0.0',
        diffCommits: `<details>
         <summary>Commits</summary>
         body <a href="https://urls.greenkeeper.io/greenkeeperio/greenkeeper">
       </details>`
      }
    })
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      expect(transforms).toHaveLength(2)
      return '1234abcd'
    })
    jest.mock('../../lib/monorepo', () => {
      jest.mock('greenkeeper-monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('greenkeeper-monorepo-definitions')
        const newDef = Object.assign(monorepoDefinitions, {
          pouchdb: ['pouchdb', 'pouchdb-core', 'pouchdb-adapter-utils']
        })
        return newDef
      })
      return require.requireActual('../../lib/monorepo')
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')
    const newJob = await createGroupVersionBranch({
      dependency: 'pouchdb-adapter-utils',
      accountId: '123-two-packages',
      repositoryId: '123-monorepo-monorepo-release-ignore',
      types: [
        {type: 'dependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'package.json'}],
      version: '2.0.0',
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
        { id: '123-monorepo-monorepo-release-ignore',
          key: 'pouchdb-adapter-utils',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo-monorepo-release-ignore',
          key: 'pouchdb-adapter-utils',
          value: {
            fullName: 'hans/monorepo',
            accountId: '123-two-packages',
            filename: 'backend/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } } ]
    })

    githubMock.done()
    expect(newJob).toBeFalsy()
    const { repositories } = await dbs()
    const branch = await repositories.get('123-monorepo-monorepo-release-ignore:branch:1234abcd')
    const pr = await repositories.get('123-monorepo-monorepo-release-ignore:pr:321')
    expect(branch.processed).toBeTruthy()
    expect(branch.head).toEqual('greenkeeper/default/monorepo.pouchdb-2.0.0')
    expect(branch.repositoryId).toEqual('123-monorepo-monorepo-release-ignore')
    expect(branch.accountId).toEqual('123-two-packages')
    expect(branch.dependencyType).toEqual('dependencies')
    expect(pr.number).toBe(66)
    expect(pr.state).toEqual('open')
    expect(pr.repositoryId).toEqual('123-monorepo-monorepo-release-ignore')
    expect(pr.accountId).toEqual('123-two-packages')
  })
})

describe('create-group-version-branch with lockfiles', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    nock.cleanAll()
  })

  beforeAll(async () => {
    const { installations } = await dbs()
    await installations.put({
      _id: '123-lockfiles',
      installation: 87,
      plan: 'free'
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
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()

    await Promise.all([
      removeIfExists(installations, '123-lockfiles'),
      removeIfExists(repositories, 'monorepo-with-lockfiles-1', 'monorepo-with-lockfiles-2')
    ])
  })

  const twoGroupsConfig = {
    'groups': {
      'default': {
        'packages': [
          'frontend/package.json',
          'backend/package.json'
        ]
      }
    }
  }

  test('new pull request, 2 groups, 1 package, same dependencyType, both have lockfiles', async () => {
    expect.assertions(21)
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'monorepo-with-lockfiles-1',
      accountId: '124',
      fullName: 'finnp/monorepo-with-lockfiles',
      private: false,
      files: {
        'package.json': ['frontend/package.json', 'backend/package.json'],
        'package-lock.json': ['frontend/package-lock.json', 'backend/package-lock.json'],
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'frontend/package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          }
        },
        'backend/package.json': {
          devDependencies: {
            '@finnpauls/dep': '^1.0.0'
          }
        }
      },
      greenkeeper: twoGroupsConfig
    })

    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens').optionally().reply(200, {token: 'secret'})
      .get('/rate_limit').optionally().reply(200)
      .get('/repos/finnp/monorepo-with-lockfiles')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/monorepo-with-lockfiles/contents/frontend/package-lock.json')
      .reply(200, {
        type: 'file',
        path: 'frontend/package-lock.json',
        name: 'package-lock.json',
        content: Buffer.from(JSON.stringify({devDependencies: {
          '@finnpauls/dep': '1.0.0'
        }})).toString('base64')
      })
      .get('/repos/finnp/monorepo-with-lockfiles/contents/backend/package-lock.json')
      .reply(200, {
        type: 'file',
        path: 'backend/package-lock.json',
        name: 'package-lock.json',
        content: Buffer.from(JSON.stringify({devDependencies: {
          '@finnpauls/dep': '1.0.0'
        }})).toString('base64')
      })
      .post('/repos/finnp/monorepo-with-lockfiles/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 321,
          number: 71,
          state: 'open'
        }
      })
      .post(
        '/repos/finnp/monorepo-with-lockfiles/issues/71/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201)
      .post(
        '/repos/finnp/monorepo-with-lockfiles/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201)

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.packageJson).toBe('string')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: '{"dependencies":{"@finnpauls/dep": {"version": "2.0.0"}}}' // TODO: devDependencies?
        }
      })
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.packageJson).toBe('string')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: '{"dependencies":{"@finnpauls/dep": {"version": "2.0.0"}}}' // TODO: devDependencies?
        }
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(4)
      let newPackageLock = await transforms[0].transform(JSON.stringify({
        devDependencies: {
          '@finnpauls/dep': '2.0.0'
        }
      }))
      let newPackageJSON = transforms[1].transform(JSON.stringify({
        devDependencies: {
          '@finnpauls/dep': '2.0.0'
        }
      }))

      expect(transforms[0].path).toEqual('frontend/package-lock.json')
      expect(transforms[1].path).toEqual('frontend/package.json')
      expect(transforms[2].path).toEqual('backend/package-lock.json')
      expect(transforms[3].path).toEqual('backend/package.json')
      expect(newPackageJSON).toMatchSnapshot()
      expect(newPackageLock).toMatchSnapshot()

      return '1234abcd'
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: '@finnpauls/dep',
      accountId: '123-lockfiles',
      repositoryId: 'monorepo-with-lockfiles-1',
      types: [
        {type: 'devDependencies', filename: 'backend/package.json'},
        {type: 'devDependencies', filename: 'frontend/package.json'}],
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: {
        'default': {
          'packages': [
            'frontend/package.json',
            'backend/package.json'
          ]
        }
      },
      monorepo: [
        { id: '123-lockfiles',
          key: '@finnpauls/dep',
          value: {
            fullName: 'finnp/monorepo-with-lockfiles',
            accountId: '123-lockfiles',
            filename: 'frontend/package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo',
          key: '@finnpauls/dep',
          value: {
            fullName: 'finnp/monorepo-with-lockfiles',
            accountId: '123-lockfiles',
            filename: 'backend/package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } } ]
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('monorepo-with-lockfiles-1:branch:1234abcd')
    expect(branch.head).toEqual('greenkeeper/default/@finnpauls/dep-2.0.0')
    expect(branch.repositoryId).toEqual('monorepo-with-lockfiles-1')
    expect(branch.dependencyType).toEqual('devDependencies')
  })

  test('new pull request, 2 groups, 1 package, different dependencyTypes, one has lockfile', async () => {
    expect.assertions(16)
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'monorepo-with-lockfiles-2',
      accountId: '124',
      fullName: 'finnp/monorepo-with-lockfiles',
      private: false,
      files: {
        'package.json': ['frontend/package.json', 'backend/package.json'],
        'package-lock.json': ['frontend/package-lock.json'],
        'npm-shrinkwrap.json': false,
        'yarn.lock': false
      },
      packages: {
        'frontend/package.json': {
          dependencies: {
            'cat': '^1.0.0'
          }
        },
        'backend/package.json': {
          devDependencies: {
            'cat': '^1.0.0'
          }
        }
      },
      greenkeeper: twoGroupsConfig
    })

    const githubMock = nock('https://api.github.com')
      .post('/installations/87/access_tokens').optionally().reply(200, {token: 'secret'})
      .get('/rate_limit').optionally().reply(200)
      .get('/repos/finnp/monorepo-with-lockfiles')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/monorepo-with-lockfiles/contents/frontend/package-lock.json')
      .reply(200, {
        type: 'file',
        path: 'frontend/package-lock.json',
        name: 'package-lock.json',
        content: Buffer.from(JSON.stringify({devDependencies: {
          'cat': '1.0.0'
        }})).toString('base64')
      })
      .post('/repos/finnp/monorepo-with-lockfiles/pulls')
      .reply(200, () => {
        // pull request created
        expect(true).toBeTruthy()
        return {
          id: 321,
          number: 71,
          state: 'open'
        }
      })
      .post(
        '/repos/finnp/monorepo-with-lockfiles/issues/71/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201)
      .post(
        '/repos/finnp/monorepo-with-lockfiles/statuses/1234abcd',
        ({ state }) => state === 'success'
      )
      .reply(201)

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.packageJson).toBe('string')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: '{"dependencies":{"cat": {"version": "2.0.0"}}}' // TODO: devDependencies?
        }
      })

    jest.mock('../../lib/create-branch', () => async ({ transforms }) => {
      expect(transforms).toHaveLength(3)
      let newPackageLock = await transforms[0].transform(JSON.stringify({
        dependencies: {
          'cat': '2.0.0'
        }
      }))
      let newPackageJSON = transforms[1].transform(JSON.stringify({
        devDependencies: {
          'cat': '2.0.0'
        }
      }))

      expect(transforms[0].path).toEqual('frontend/package-lock.json')
      expect(transforms[1].path).toEqual('frontend/package.json')
      expect(transforms[2].path).toEqual('backend/package.json')
      expect(newPackageJSON).toMatchSnapshot()
      expect(newPackageLock).toMatchSnapshot()

      return '1234abcd'
    })
    const createGroupVersionBranch = require('../../jobs/create-group-version-branch')

    const newJob = await createGroupVersionBranch({
      dependency: 'cat',
      accountId: '123-lockfiles',
      repositoryId: 'monorepo-with-lockfiles-2',
      types: [
        {type: 'devDependencies', filename: 'backend/package.json'},
        {type: 'dependencies', filename: 'frontend/package.json'}],
      version: '2.0.0',
      oldVersion: '^1.0.0',
      oldVersionResolved: '1.0.0',
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      group: twoGroupsConfig.groups,
      monorepo: [
        { id: '123-lockfiles',
          key: 'cat',
          value: {
            fullName: 'finnp/monorepo-with-lockfiles',
            accountId: '123-lockfiles',
            filename: 'frontend/package.json',
            type: 'dependencies',
            oldVersion: '1.0.0' } },
        { id: '123-monorepo',
          key: 'cat',
          value: {
            fullName: 'finnp/monorepo-with-lockfiles',
            accountId: '123-lockfiles',
            filename: 'backend/package.json',
            type: 'devDependencies',
            oldVersion: '1.0.0' } } ]
    })

    expect(githubMock.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('monorepo-with-lockfiles-2:branch:1234abcd')
    expect(branch.head).toEqual('greenkeeper/default/cat-2.0.0')
    expect(branch.repositoryId).toEqual('monorepo-with-lockfiles-2')
    expect(branch.dependencyType).toEqual('dependencies')
  })
})
