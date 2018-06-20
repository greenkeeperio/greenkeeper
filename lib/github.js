const url = require('url')

const _ = require('lodash')
const promiseRetry = require('promise-retry')
const errorCodes = require('../lib/network-error-codes')
const env = require('../lib/env')

function ghRetry (octokit) {
  octokit.hook.error('request', (error, options) => {
    const type = error.code || error.message
    if (!errorCodes.includes(type)) {
      throw error
    }

    return promiseRetry(retry => {
      return octokitRequest(options).catch(error => {
        const type = error.code || error.message
        if (!errorCodes.includes(type)) {
          throw error
        }

        retry(error)
      })
    }, {
      retries: 5,
      minTimeout: 3000
    })
  })
}

const Octokit = require('@octokit/rest')
const octokitRequest = require('@octokit/rest/lib/request')
const Github = function (options) {
  if (env.GITHUB_URL !== 'https://github.com') {
    options.baseUrl = url.resolve(env.GITHUB_URL, '/api/v3')
  }
  const octokit = new Octokit(options)
  octokit.plugin(ghRetry)

  return octokit
}

const githubHost = {}
if (env.GITHUB_HOST) {
  try {
    const parsed = url.parse(env.GITHUB_HOST)
    githubHost.protocol = parsed.protocol.replace(':', '')
    githubHost.host = parsed.host
    if (parsed.pathname !== '/') githubHost.pathPrefix = parsed.pathname
  } catch (e) {
    console.log('error parsing GITHUB_HOST', e)
  }
}


module.exports = options => new Github(
  _.defaultsDeep(options || {}, {
    headers: {
      accept: 'application/vnd.github.v3+json',
      'user-agent': 'Greenkeeper'
    }
  })
)
