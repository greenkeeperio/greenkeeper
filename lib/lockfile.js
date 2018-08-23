const request = require('request-promise')
const promiseRetry = require('promise-retry')
const Log = require('gk-log')
const dbs = require('../lib/dbs')
const errorCodes = require('../lib/network-error-codes')

const env = require('./env')
module.exports = {
  getNewLockfile
}

async function getNewLockfile (packageJson, lock, isNpm) {
  const logs = dbs.getLogsDb()

  const log = Log({
    logsDb: logs,
    accountId: 'lockfile',
    repoSlug: null,
    context: 'lockfile'
  })

  const type = isNpm ? 'npm' : 'yarn'

  return promiseRetry((retry, number) => {
    /*
      if we get a 500 or Network error here, log, and try again a few times.
    */
    return request({
      uri: `${env.EXEC_SERVER_URL}`,
      method: 'POST',
      json: true,
      body: {
        type,
        packageJson,
        lock
      }
    })
      .catch(error => {
        // promise-retry either returns StatusCodeError (with error.statusCode)
        // or RequestError (with error.error.code)
        const type = error.statusCode ? error.statusCode : error.error.code
        if (errorCodes.includes(type) || type.toString().includes('500')) {
          if (number === 3) {
            // ignore and log failure here
            log.error(`could not get lockfile, attempt #${number}: giving up`)
          } else {
            log.warn(`could not get lockfile, attempt #${number}: retrying`)
          }
          retry(error)
        } else {
          throw error
        }
      })
  }, {
    retries: 3,
    minTimeout: process.env.NODE_ENV === 'testing' ? 1 : 5000
  })
}
