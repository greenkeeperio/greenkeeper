const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const initTimeoutPr = require('../../jobs/initial-timeout-pr')

describe('initial-timeout-pr', async () => {
  beforeAll(async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '10101',
      installation: 37
    })
    await repositories.put({
      _id: '666',
      fullName: 'finnp/test'
    })
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, '10101', '1338'),
      removeIfExists(repositories, '666', '666:pr:11', '666:issue:10')
    ])
  })

  test('create', async () => {
    const githubMock = nock('https://api.github.com')
      .post('/installations/37/access_tokens')
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .reply(200, {})
      .post('/repos/finnp/test/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
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

    const newJobs = await initTimeoutPr({
      repositoryId: 666,
      accountId: 10101
    })
    expect(newJobs).toBeFalsy()

    const { repositories } = await dbs()
    const issue = await repositories.get('666:issue:10')
    expect(issue.initial).toBeTruthy()
    expect(issue.type).toEqual('issue')
    expect(issue.number).toBe(10)
    expect(issue.repositoryId).toBe(666)
    githubMock.done()
  })

  test('already exists', async () => {
    nock('https://api.github.com') // no request should be made
    expect.assertions(2)

    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '1338',
      installation: 38
    })
    await repositories.put({
      _id: '6666:pr:11',
      type: 'pr',
      repositoryId: '6666',
      head: 'greenkeeper/initial'
    })

    const newJobs = await initTimeoutPr({
      repositoryId: 6666,
      accountId: 1338
    })

    expect(newJobs).toBeFalsy()

    try {
      await repositories.get('6666:issue:10')
    } catch (e) {
      // throws
      expect(true).toBeTruthy()
    }
  })
})
