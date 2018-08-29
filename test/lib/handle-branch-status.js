const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('handle-branch-status', async () => {
  afterAll(async () => {
    const { repositories, installations, npm } = await dbs()
    await Promise.all([
      removeIfExists(repositories, '42:branch:deadbeef', '42:branch:deadbeef2', '43:branch:deadbeef3', '43:issue:5',
        'monorepo:branch:deadbeef3', 'monorepo:issue:9',
        'monorepo:branch:deadbeef4', 'monorepo:issue:10',
        'monorepo:branch:deadbeef5', 'monorepo:issue:11'),
      removeIfExists(installations, '10'),
      removeIfExists(npm, 'test', 'test2', 'test3', 'test4', 'test5')
    ])
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(async () => {
    const { repositories, installations, npm } = await dbs()
    await Promise.all([
      installations.put({
        _id: '10',
        installation: '1337'
      }),
      npm.put({
        _id: 'test',
        versions: {
          '1.0.1': {
            repository: {
              url: 'http://github.com/locats/test'
            }
          }
        }
      }),
      npm.put({
        _id: 'test2',
        versions: {
          '1.0.2': {
            repository: {
              url: 'http://github.com/locats/test2'
            }
          }
        }
      }),
      repositories.put({
        _id: '42:branch:deadbeef',
        type: 'branch',
        sha: 'deadbeef',
        head: 'branchname',
        dependency: 'test',
        version: '1.0.1'
      }),
      repositories.put({
        _id: '42:branch:deadbeef2',
        type: 'branch',
        sha: 'deadbeef2',
        head: 'branchname2',
        dependency: 'test2',
        version: '1.0.2'
      })
    ])
  })

  test('success', async () => {
    jest.mock('../../lib/open-issue', data => data => {
      // open an issue
      expect(true).toBeTruthy()
    })
    const handleBranchStatus = require('../../lib/handle-branch-status')

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .delete('/repos/club/mate/git/refs/heads/branchname')
      .reply(422, () => {
        // simulate reference already been deleted
        expect(true).toBeTruthy()
        return {
          message: 'Reference does not exist'
        }
      })

    const { repositories } = await dbs()

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: '10',
      repository: {
        id: '42',
        full_name: 'club/mate'
      },
      branchDoc: await repositories.get('42:branch:deadbeef'),
      combined: {
        state: 'success',
        combined: []
      }
    })

    expect(newJob).toBeFalsy()
    const branch = await repositories.get('42:branch:deadbeef')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeTruthy()
    expect(branch.state).toEqual('success')
  })

  test('failure', async () => {
    const { repositories } = await dbs()

    expect.assertions(4)
    jest.mock('../../lib/open-issue', data => data => {
      // open an issue
      expect(true).toBeTruthy()
    })
    const handleBranchStatus = require('../../lib/handle-branch-status')

    nock('https://api.github.com')

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'failure', statuses: [] },
      branchDoc: await repositories.get('42:branch:deadbeef2'),
      repository: {
        id: 42,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })

    expect(newJob).toBeFalsy()
    const branch = await repositories.get('42:branch:deadbeef2')
    expect(branch.processed).toBeTruthy()
    expect(branch.state).toEqual('failure')
  })

  test.only('with issue', async () => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    const { repositories, npm } = await dbs()

    expect.assertions(6)
    await Promise.all([
      repositories.put({
        _id: '43:issue:5',
        type: 'issue',
        state: 'open',
        dependency: 'test3',
        repositoryId: '43',
        number: 5
      }),
      npm.put({
        _id: 'test3',
        versions: {}
      }),
      repositories.put({
        _id: '43:branch:deadbeef3',
        type: 'branch',
        sha: 'deadbeef3',
        head: 'branchname3',
        dependency: 'test3',
        version: '1.0.1',
        base: 'master',
        dependencyType: 'devDependencies',
        oldVersionResolved: '1.0.0'
      })
    ])

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/club/mate/issues/5/comments', ({ body }) => {
        console.log('body', body)
        expect(body).toMatch(/\/club\/mate\/compare\/master...club:branchname3/)
        return true
      })
      .reply(201, () => {
        // commented on right issue
        expect(true).toBeTruthy()
      })

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'success', statuses: [] },
      branchDoc: await repositories.get('43:branch:deadbeef3'),
      repository: {
        id: 43,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('43:branch:deadbeef3')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeFalsy()
    expect(branch.state).toEqual('success')
  })

  test('Monorepo: with issue, do not comment for the same version', async () => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    const { repositories, npm } = await dbs()

    expect.assertions(6)
    await Promise.all([
      repositories.put({
        _id: 'monorepo:issue:9',
        type: 'issue',
        state: 'open',
        dependency: 'test4',
        version: '1.0.1',
        repositoryId: 'monorepo',
        number: 9
      }),
      npm.put({
        _id: 'test4',
        versions: {}
      }),
      repositories.put({
        _id: 'monorepo:branch:deadbeef3',
        type: 'branch',
        sha: 'deadbeef3',
        head: 'branchname3',
        dependency: 'test4',
        version: '1.0.1',
        group: 'one'
      })
    ])

    const github = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'failure', statuses: [] },
      branchDoc: await repositories.get('monorepo:branch:deadbeef3'),
      repository: {
        id: 'monorepo',
        full_name: 'ilse/monorepo',
        owner: {
          id: 10
        }
      }
    })
    expect(github.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('monorepo:branch:deadbeef3')
    const issue = await repositories.get('monorepo:issue:9')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeFalsy()
    expect(branch.state).toEqual('failure')
    expect(issue.comments).toBeFalsy()
  })

  test('Monorepo: with issue getting a comment', async () => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    const { repositories, npm } = await dbs()

    expect.assertions(8)
    await Promise.all([
      repositories.put({
        _id: 'monorepo:issue:10',
        type: 'issue',
        state: 'open',
        dependency: 'test5',
        version: '1.0.1',
        repositoryId: 'monorepo',
        number: 9
      }),
      npm.put({
        _id: 'test5',
        versions: {}
      }),
      repositories.put({
        _id: 'monorepo:branch:deadbeef4',
        type: 'branch',
        sha: 'deadbeef4',
        head: 'branchname4',
        base: 'master',
        dependency: 'test5',
        version: '1.0.2',
        group: 'one'
      })
    ])

    const github = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/ilse/monorepo/issues/9/comments', ({ body }) => {
        expect(body).toMatch(/\/ilse\/monorepo\/compare\/master...ilse:branchname4/)
        return true
      })
      .reply(201, () => {
        // commented on right issue
        expect(true).toBeTruthy()
      })

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'failure', statuses: [] },
      branchDoc: await repositories.get('monorepo:branch:deadbeef4'),
      repository: {
        id: 'monorepo',
        full_name: 'ilse/monorepo',
        owner: {
          id: 10
        }
      }
    })
    expect(github.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('monorepo:branch:deadbeef4')
    const issue = await repositories.get('monorepo:issue:10')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeFalsy()
    expect(branch.state).toEqual('failure')
    expect(issue.comments).toEqual(['1.0.2'])
  })

  test('Monorepo: with issue getting the "Explicitly upgrade to this version" comment', async () => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    const { repositories } = await dbs()

    expect.assertions(8)
    await Promise.all([
      repositories.put({
        _id: 'monorepo:issue:11',
        type: 'issue',
        state: 'open',
        dependency: 'test5',
        version: '1.0.1',
        repositoryId: 'monorepo',
        number: 9
      }),
      repositories.put({
        _id: 'monorepo:branch:deadbeef5',
        type: 'branch',
        sha: 'deadbeef5',
        head: 'branchname5',
        base: 'master',
        dependency: 'test5',
        version: '1.0.2',
        group: 'one'
      })
    ])

    const github = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/ilse/monorepo/issues/9/comments', ({ body }) => {
        expect(body).toMatch('Your tests for group **one** are passing again with this version. [Explicitly upgrade **one** to this version 🚀]')
        return true
      })
      .reply(201, () => {
        // commented on right issue
        expect(true).toBeTruthy()
      })

    const newJob = await handleBranchStatus({
      installationId: '123',
      accountId: 10,
      combined: { state: 'success', statuses: [] },
      branchDoc: await repositories.get('monorepo:branch:deadbeef5'),
      repository: {
        id: 'monorepo',
        full_name: 'ilse/monorepo',
        owner: {
          id: 10
        }
      }
    })
    expect(github.isDone()).toBeTruthy()
    expect(newJob).toBeFalsy()
    const branch = await repositories.get('monorepo:branch:deadbeef5')
    const issue = await repositories.get('monorepo:issue:11')
    expect(branch.processed).toBeTruthy()
    expect(branch.referenceDeleted).toBeFalsy()
    expect(branch.state).toEqual('success')
    expect(issue.comments).toBeFalsy()
  })
})
