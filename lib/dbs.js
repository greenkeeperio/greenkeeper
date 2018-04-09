const { resolve } = require('url')

global.Promise = require('bluebird')

const _ = require('lodash')
const bootstrap = require('couchdb-bootstrap')
const PouchDB = require('pouchdb-http')
  .plugin(require('pouchdb-mapreduce'))
  .plugin(require('pouchdb-upsert'))
const { promisify } = require('bluebird')
const promiseRetry = require('promise-retry')
const errorCodes = require('../lib/network-error-codes')

const env = require('./env')

const retryMethods = [
  'upsert',
  'get',
  'put',
  'post',
  'remove',
  'bulkDocs',
  'allDocs',
  'query',
  'bulkGet'
]
const retryHandler = {
  get: (target, name) => function (...args) {
    const original = target[name]

    if (!retryMethods.includes(name)) return original.apply(target, args)

    return promiseRetry(
      retry => {
        return original.apply(target, args).catch(err => {
          const type = err.code || err.message
          if (!errorCodes.includes(type)) {
            throw err
          }

          retry(err)
        })
      },
      {
        retries: 5,
        minTimeout: 3000
      }
    )
  }
}

function getLogsDb () {
  const date = new Date()
  const currentLogDbName = 'logs-' + date.toISOString().substr(0, 7) + (env.isProduction ? '' : '-staging')
  const db = new PouchDB(resolve(env.COUCH_URL, currentLogDbName))
  return new Proxy(db, retryHandler)
}

async function getDb () {
  const result = await promisify(bootstrap)(env.COUCH_URL, 'couchdb', {
    mapDbName: dbname => dbname + (env.isProduction ? '' : '-staging')
  })

  return _(result.push)
    .mapValues((v, name) => new PouchDB(resolve(env.COUCH_URL, name)))
    .mapValues(db => new Proxy(db, retryHandler))
    .mapKeys((v, name) => {
      return name
    })
    .mapKeys((v, name) => name.replace('-staging', ''))
    .value()
}

module.exports = _.memoize(getDb)
module.exports.getLogsDb = getLogsDb
