const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')
const GKKit = require('../../lib/gk-kit')

describe('gk-kit', async () => {
  beforeAll(async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: 'accountId1',
      installation: '1'
    })
    await repositories.put({
      _id: 'r1',
      fullName: 'finnp/test'
    })
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, 'accountId1'),
      removeIfExists(repositories, 'r1', 'r1:issue:10')
    ])
  })

  test('installations getId()', async () => {
    expect((await GKKit('accountId1').installations()).getId()).toBe('1')
  })

  test('repositories issues getInvalidConfigIssueNumber', async () => {
    const { repositories } = await dbs()

    const repo = await GKKit('accountId1').repositories('r1')
    expect(await repo.issues.getInvalidConfigIssueNumber()).toBeFalsy()

    await repositories.put({
      _id: `r1:issue:22`,
      type: 'issue',
      repositoryId: 'r1',
      number: '22',
      state: 'open',
      initial: false,
      invalidConfig: true
    })

    expect(await repo.issues.getInvalidConfigIssueNumber()).toBe('22')
  })

  test('repositories issues create', async () => {
    const githubMock = nock('https://api.github.com')
      .post('/installations/1/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/finnp/test/issues', ({ title, body, labels }) => {
        expect(title).toBe('Titel')
        expect(body).toBe('Body')
        expect(labels).toContain('greenkeeper')
        return true
      })
      .reply(201, () => {
        // issue created
        expect(true).toBeTruthy()
        return {
          number: 10
        }
      })

    const repo = await GKKit('accountId1').repositories('r1')
    await repo.issues.create(
      'Titel',
      'Body',
      {
        initial: false,
        invalidConfig: true
      }
    )

    const { repositories } = await dbs()
    const issue = await repositories.get('r1:issue:10')
    expect(issue.initial).toBeFalsy()
    expect(issue.invalidConfig).toBeTruthy()
    expect(issue.type).toEqual('issue')
    expect(issue.number).toBe(10)
    expect(issue.repositoryId).toBe('r1')
    githubMock.done()
  })
})
