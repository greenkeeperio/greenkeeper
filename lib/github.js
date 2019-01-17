const url = require('url')

const _ = require('lodash')
const promiseRetry = require('promise-retry')
const errorCodes = require('../lib/network-error-codes')
const env = require('../lib/env')

const ghRetry = (octokit) => {
  octokit.hook.error('request', (error, options) => {
    const type = error.status || error.message
    if (!errorCodes.includes(type)) {
      throw error
    }

    return promiseRetry(retry => {
      return octokitRequest(options).catch(error => {
        const type = error.status || error.message
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

const Octokit = require('@octokit/rest').plugin(ghRetry)
const octokitRequest = require('@octokit/request')

const Github = function (options) {
  if (env.GITHUB_URL !== 'https://github.com') {
    options.baseUrl = url.resolve(env.GITHUB_URL, '/api/v3')
  }
  const octokit = new Octokit(options)
  return octokit
}

module.exports = options => new Github(
  _.defaultsDeep(options || {}, {
    headers: {
      accept: 'application/vnd.github.v3+json',
      'user-agent': 'Greenkeeper'
    }
  })
)
