const zlib = require('zlib')

const { Client, Policy } = require('catbox')
const jwt = require('jsonwebtoken')
const retry = require('retry-promise').default
const { promisify } = require('bluebird')

const env = require('./env')
const Github = require('./github')

let cert
if (env.IS_ENTERPRISE) {
  // In GKE, we don’t zip the private key, so we don’t need to unzip it here.
  // This is because zipping is unnecessarily complicated in Replicated, and
  // just base64 encoding achieves our goal of getting the key into a single line
  // as well, it’s just a pretty long line.
  cert = Buffer.from(env.PRIVATE_KEY, 'base64')
} else {
  cert = zlib.gunzipSync(Buffer.from(env.PRIVATE_KEY, 'base64'))
}

const client = new Client(require('catbox-memory'))
const cache = new Policy(
  {
    expiresIn: env.NODE_ENV === 'testing' ? 10000 : 30 * 60 * 1000,
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

  let github = Github({ auth: `Bearer ${token}` })

  const result = (await github.apps.createInstallationToken({
    installation_id: parseInt(iss, 10)
  })).data

  // making sure this token is valid
  // GitHub sometimes gives us bad credential errors
  // with completly fresh tokens
  github = Github({ auth: `token ${result.token}` })

  await retry(
    {
      max: 5,
      backoff: 300
    },
    async (num) => {
      try {
        return await github.rateLimit.get({})
      } catch (e) {
        // rate limit might be disabled on GitHub Enterprise
        if (!e.toString().match(/Rate limiting is not enabled/)) {
          throw e
        }
        return {}
      }
    }
  )

  return result
}
