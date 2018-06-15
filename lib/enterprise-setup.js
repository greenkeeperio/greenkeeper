const PouchDB = require('pouchdb-http')

const env = require('./env')

module.exports = async function () {
  // create /_users if not exists
  const host = env.COUCHDB_URL
  const dbName = '_users'
  const users = new PouchDB(`${host}/${dbName}`)
  return users.info()
}
