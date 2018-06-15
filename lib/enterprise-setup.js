const { resolve } = require('url')
const PouchDB = require('pouchdb-http')

const env = require('./env')

module.exports = async function () {
  // create /_users if not exists
  const host = env.COUCH_URL
  const dbName = '_users'
  const dbUrl = resolve(host, dbName)
  const users = new PouchDB(dbUrl)
  return users.info()
}
