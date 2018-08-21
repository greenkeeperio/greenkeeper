const request = require('request-promise')
const promiseRetry = require('promise-retry')
const Log = require('gk-log')
const dbs = require('../lib/dbs')

const env = require('./env')
module.exports = {
  getNewLockfile
}

const max404Retries = 5

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
      if we get a 404 here, log, and try again a few times.
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
        if (error.statusCode === 404) {
          if (number === max404Retries) {
            // ignore and log failure here
            log.error(`could not get lockfile, attempt #${number}: giving up`)
          } else {
            log.warn(`could not get lockfile, attempt #${number}: retrying`)
            retry(error)
          }
        } else { // not a 404, throw normally
          throw error
        }
      })
  }, {
    retries: max404Retries,
    minTimeout: process.env.NODE_ENV === 'testing' ? 1 : 3000
  })
}
