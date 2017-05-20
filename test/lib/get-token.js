const nock = require('nock')
const { test } = require('tap')
const proxyquire = require('proxyquire')

test('get token', async t => {
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'Bearer jwtToken' }
  })
    .post('/installations/1337/access_tokens')
    .reply(200, { token: 'the-token' })

  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token the-token' }
  })
    .get('/rate_limit')
    .reply(401)
    .get('/rate_limit')
    .reply(200)

  const getToken = proxyquire('../../lib/get-token', {
    zlib: { gunzipSync: () => 'cert' },
    jsonwebtoken: {
      sign: (payload, cert) => {
        if (cert === 'cert') return 'jwtToken'
      }
    }
  })

  t.is((await getToken(1337)).token, 'the-token', 'uncached')
  t.is((await getToken(1337)).token, 'the-token', 'cached')
  t.end()
})
