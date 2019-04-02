const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('payment-required', async () => {
  beforeAll(async () => {
    const { repositories, installations } = await dbs()

    await installations.put({
      _id: '111',
      installation: 11,
      plan: 'free'
    })

    await repositories.put({
      _id: '1_payment-required',
      accountId: '111',
      fullName: 'jacoba/private',
      enabled: true,
      private: true
    })
  })

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(repositories, 'payment-required'),
      removeIfExists(installations, '111')
    ])
  })

  test('create payment-required issue', async () => {
    expect.assertions(9)
    const githubMock = nock('https://api.github.com')
      .post('/app/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .post('/repos/jacoba/private/issues', ({ title, body, labels }) => {
        expect(title).toEqual('Payment required')
        expect(body).toMatch(/🚨 You privatised your repo. 🚨/)
        expect(body).toMatch(/Please enter your payment information at/)
        expect(labels[0]).toEqual('greenkeeper')
        return true
      })
      .reply(201, () => {
        return {
          number: 10
        }
      })

    const paymentRequired = require('../../jobs/payment-required')
    const newJob = await paymentRequired({ accountId: '111', repositoryId: '1_payment-required' })
    expect(newJob).toBeFalsy()

    const { repositories } = await dbs()
    const issue = await repositories.get('1_payment-required:issue:10')
    expect(issue.initial).toBeFalsy()
    expect(issue.type).toEqual('issue')
    expect(issue.number).toBe(10)
    expect(issue.repositoryId).toBe('1_payment-required')
    githubMock.done()
  })
})
