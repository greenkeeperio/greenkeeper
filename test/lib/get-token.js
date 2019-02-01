const nock = require('nock')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('get token', async () => {
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'app jwtToken' }
  })
    .post('/app/installations/1337/access_tokens')
    .reply(200, { token: 'the-token' })

  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token the-token' }
  })
    .get('/rate_limit')
    .reply(401)
    .get('/rate_limit')
    .reply(200)

  jest.mock('zlib', () => {
    return {
      gunzipSync: () => 'cert'
    }
  }).mock('jsonwebtoken', () => {
    return {
      sign: (payload, cert) => {
        if (cert === 'cert') return 'jwtToken'
      }
    }
  })
  const getToken = require('../../lib/get-token')

  const token = (await getToken(1337)).token
  expect(token).toEqual('the-token') // uncached
  expect(token).toEqual('the-token') // cached
})
