const { resolve } = require('url')
const PouchDB = require('pouchdb-http')

const env = require('./env')
const dbNames = ['_users']

function createDB (host, dbName) {
  const dbUrl = resolve(host, dbName)
  const db = new PouchDB(dbUrl)
  return db.info()
}

function removeDB (host, dbName) {
  const dbUrl = resolve(host, dbName)
  const db = new PouchDB(dbUrl)
  return db.destroy()
}

function generateLogsName (date) {
  return `logs-${date.toISOString().substr(0, 7)}${env.isProduction ? '' : '-staging'}`
}

function getEnterpriseDBNames () {
  const today = new Date()
  const nextMonth = new Date(new Date().setMonth(today.getMonth() + 1))

  // if we don't have a logsDB for the actual month, push it to the array
  const actualLogs = generateLogsName(today)
  if (!dbNames.includes(actualLogs)) dbNames.push(actualLogs)

  // if we don't have a logsDB for the next month, push it to the array
  const nextLogs = generateLogsName(nextMonth)
  if (!dbNames.includes(nextLogs)) dbNames.push(nextLogs)

  return dbNames
}

module.exports = async function () {
  const host = env.COUCH_URL
  const enterpriseDbNames = await getEnterpriseDBNames()

  // if we have '_users and logs, older than 12 month, remove the oldest logsDB
  if (enterpriseDbNames.length > 13) {
    await removeDB(host, enterpriseDbNames[1])
    enterpriseDbNames.splice(1, 1)
  }

  // create /_users and logs if not exists
  return Promise.all(
    enterpriseDbNames.map(dbName => {
      return createDB(host, dbName)
    })
  )
}
