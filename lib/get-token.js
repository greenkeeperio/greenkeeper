const zlib = require('zlib')

const { Client, Policy } = require('catbox')
const jwt = require('jsonwebtoken')
const retry = require('retry-promise').default
const { promisify } = require('bluebird')

const env = require('./env')
const Github = require('./github')

const cert = zlib.gunzipSync(Buffer.from(env.PRIVATE_KEY, 'base64'))

const client = new Client(require('catbox-memory'))
const cache = new Policy(
  {
    expiresIn: env.NODE_ENV === 'testing' ? 1000 : 30 * 60 * 1000,
    generateTimeout: false,
    generateFunc: (id, next) => {
      getToken(Number(id)).then(token => next(null, token)).catch(next)
    }
  },
  client,
  'installation-token'
)
const cacheStarted = promisify(client.start, { context: client })()

module.exports = async id => {
  await cacheStarted
  return promisify(cache.get, { context: cache })(String(id))
}

async function getToken (iss) {
  const token = jwt.sign({}, cert, {
    algorithm: 'RS256',
    expiresIn: '1m',
    issuer: env.ISSUER_ID
  })

  const github = Github()
  github.authenticate({
    type: 'integration',
    token
  })
  const result = (await github.integrations.createInstallationToken({
    installation_id: iss
  })).data

  // making sure this token is valid
  // GitHub sometimes gives us bad credential errors
  // with completly fresh tokens
  github.authenticate({ type: 'token', token: result.token })
  await retry(
    {
      max: 5,
      backoff: 300
    },
    () => github.misc.getRateLimit({})
  )

  return result
}
