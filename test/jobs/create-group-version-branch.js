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
      removeIfExists(repositories, '123-monorepo', '123-monorepo-different-types', '123-monorepo-dep-ignored-on-group-level', '123-monorepo-monorepo-release'),
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
    expect.assertions(32)
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
      expect(transforms).toHaveLength(4)

      const transform0 = await transforms[0]
      expect(transform0.message).toEqual('fix(package): update pouchdb to version 2.0.0')

      const transform1 = await transforms[1]
      expect(transform1.message).toEqual('fix(package): update pouchdb to version 2.0.0')

      const transform2 = await transforms[2]
      expect(transform2.message).toEqual('fix(package): update pouchdb-adapter-utils to version 2.0.0')

      const transform3 = await transforms[3]
      expect(transform3.message).toEqual('fix(package): update pouchdb-core to version 2.0.0')

      let input = {
        dependencies: {
          'pouchdb': '1.0.0'
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

      let result2 = transform1.transform(JSON.stringify(input2))
      result2 = transform2.transform(result2)
      result2 = transform3.transform(result2)

      result = JSON.parse(result)
      result2 = JSON.parse(result2)

      expect(result.dependencies['pouchdb']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb-core']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb-adapter-utils']).toBe('2.0.0')
      expect(result2.dependencies['pouchdb']).toBe('2.0.0')
      return '1234abcd'
    })
    jest.mock('../../lib/monorepo', () => {
      jest.mock('../../utils/monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('../../utils/monorepo-definitions')
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
      jest.mock('../../utils/monorepo-definitions', () => {
        let monorepoDefinitions = require.requireActual('../../utils/monorepo-definitions')
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
