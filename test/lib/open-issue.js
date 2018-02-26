const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

afterAll(async () => {
  const { repositories } = await dbs()

  await Promise.all([
    removeIfExists(repositories, '42_oi', '42_oi:branch:deadbeef', '42_oi:issue:10')
  ])
})

test('open-issue', async () => {
  expect.assertions(30)
  const { repositories } = await dbs()

  await repositories.put({
    _id: '42_oi',
    packages: {
      'package.json': {
        greenkeeper: {
          branchPrefix: 'prefix-',
          label: 'customlabel'
        }
      }
    }
  })

  const openIssue = require('../../lib/open-issue')
  jest.mock('../../lib/create-branch', () => ({
    installationId, owner, repo, branch, newBranch, path, message, transform
  }) => {
    expect(installationId).toBeTruthy()
    expect(owner).toEqual('finnp')
    expect(repo).toEqual('testrepo')
    expect(branch).toEqual('master')
    expect(newBranch).toEqual('prefix-standard-pin-1.4.0')
    expect(path).toEqual('package.json')
    expect(message).toBeTruthy()

    const change = transform(
      JSON.stringify({
        devDependencies: {
          standard: '~2.0.0'
        }
      })
    )
    expect(change).toEqual(JSON.stringify({
      devDependencies: {
        standard: '1.4.0'
      }
    }))
    return 'deadbeef'
  })

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .post('/repos/finnp/testrepo/issues', ({ title, body, labels }) => {
      expect(title).toBeTruthy()
      expect(body).toBeTruthy()
      expect(labels).toHaveLength(1)
      expect(labels).toContain('customlabel')

      return true
    })
    .reply(201, () => {
      // issue created
      expect(true).toBeTruthy()
      return {
        number: 10
      }
    })

  await openIssue({
    installationId: '123',
    repositoryId: '42_oi',
    accountId: '1010',
    owner: 'finnp',
    repo: 'testrepo',
    version: '2.0.0',
    dependency: 'standard',
    dependencyType: 'devDependencies',
    oldVersionResolved: '1.4.0',
    base: 'master',
    head: 'greenkeeper-standard-2.0.0',
    dependencyLink: 'somelink',
    release: 'therelease',
    diffCommits: 'thecommits',
    statuses: []
  })

  const branch = await repositories.get('42_oi:branch:deadbeef')
  expect(branch.type).toEqual('branch')
  expect(branch.purpose).toEqual('pin')
  expect(branch.sha).toEqual('deadbeef')
  expect(branch.head).toEqual('prefix-standard-pin-1.4.0')
  expect(branch.base).toEqual('master')
  expect(branch.dependency).toEqual('standard')
  expect(branch.dependencyType).toEqual('devDependencies')
  expect(branch.version).toEqual('1.4.0')
  expect(branch.repositoryId).toEqual('42_oi')
  expect(branch.accountId).toEqual('1010')
  expect(branch.updatedAt).toBeTruthy()

  const issue = await repositories.get('42_oi:issue:10')
  expect(issue.type).toEqual('issue')
  expect(issue.version).toEqual('2.0.0')
  expect(issue.number).toBe(10)
  expect(issue.state).toEqual('open')
  expect(issue.dependency).toEqual('standard')
  expect(issue.repositoryId).toEqual('42_oi')
})
