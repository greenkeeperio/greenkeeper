const url = require('url')

const _ = require('lodash')
const { promisify } = require('bluebird')
const promiseRetry = require('promise-retry')

function ghRetry (ghapi) {
  const httpSend = ghapi.prototype.httpSend
  ghapi.prototype.httpSend = function (msg, block, callback) {
    const send = promisify(httpSend.bind(this, msg, block))
    promiseRetry(retry => {
      return send().catch(err => {
        const type = err.code || err.message
        if (!['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKETTIMEDOUT'].includes(type)) {
          throw err
        }

        retry(err)
      })
    }, {
      retries: 5,
      minTimeout: 3000
    })
    .then(res => callback(null, res))
    .catch(callback)
  }
  return ghapi
}

const Github = ghRetry(require('github'))

const githubHost = {}

if (process.env.GITHUB_HOST) {
  try {
    const parsed = url.parse(process.env.GITHUB_HOST)
    githubHost.protocol = parsed.protocol.replace(':', '')
    githubHost.host = parsed.host
    if (parsed.pathname !== '/') githubHost.pathPrefix = parsed.pathname
  } catch (e) {
    console.log('error parsing GITHUB_HOST', e)
  }
}

module.exports = options => new Github(
  _.defaultsDeep(options || {}, githubHost, {
    Promise: require('bluebird'),
    headers: {
      'User-Agent': 'Greenkeeper'
    }
  })
)
