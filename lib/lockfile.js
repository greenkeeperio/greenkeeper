const request = require('request-promise')
const promiseRetry = require('promise-retry')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const errorCodes = require('../lib/network-error-codes')
const env = require('./env')

module.exports = {
  getNewLockfile
}
// # getNewLockfile
// find next server
// send data to server
// increase in/flight job count for server
// if network error
// -> try next server
// else
// -> return result
// decrease in-flight jon count for server
// # find next server
// get doc from couchdb: config
// sort list by least jobs in flight
// return least busy server
let jobCountByServer = {}
async function findNextServer () {
  const { config } = await dbs()
  let servers
  try {
    // { servers: [....] }
    const doc = await config.get('exec-servers')
    servers = doc.servers
  } catch (e) {
    servers = [env.EXEC_SERVER_URL]
  }
  const sortedServers = servers.sort((a, b) => {
    const jobsA = jobCountByServer[a] || 0
    const jobsB = jobCountByServer[b] || 0
    return jobsA < jobsB ? -1 : 1
  })
  return sortedServers[0]
}
async function getNewLockfile ({
  packageJson,
  packages,
  workspaceRoot,
  lock,
  type,
  repositoryTokens }) {
  const logs = dbs.getLogsDb()
  const log = Log({
    logsDb: logs,
    accountId: 'lockfile',
    repoSlug: null,
    context: 'lockfile'
  })
  const nextServer = await findNextServer()
  jobCountByServer[nextServer] = jobCountByServer[nextServer] ? jobCountByServer[nextServer] + 1 : 1
  return promiseRetry((retry, number) => {
    return request({
      uri: nextServer,
      method: 'POST',
      json: true,
      body: {
        type,
        packageJson,
        packages,
        workspaceRoot,
        lock,
        repositoryTokens
      }
    })
      .then(result => {
        jobCountByServer[nextServer]--
        return result
      })
      .catch(error => {
        if (number >= 3) {
          log.error(`could not get lockfile from ${nextServer}, attempt #${number}: giving up`)
          jobCountByServer[nextServer]--
          throw error
        }
        const type = error.statusCode ? error.statusCode : error.error.code
        if (errorCodes.includes(type)) {
          log.warn(`could not get lockfile, attempt #${number}: retrying`)
          jobCountByServer[nextServer]--
          retry(error)
        } else {
          log.warn(`could not get lockfile, attempt #${number}: stopping because of ${error}`)
          jobCountByServer[nextServer]--
          throw error
        }
      })
  }, {
    retries: 3,
    minTimeout: 3000
  })
}
