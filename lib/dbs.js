const { resolve } = require('url')

global.Promise = require('bluebird')

const _ = require('lodash')
const bootstrap = require('couchdb-bootstrap')
const PouchDB = require('pouchdb-http')
  .plugin(require('pouchdb-mapreduce'))
  .plugin(require('pouchdb-upsert'))
const { promisify } = require('bluebird')
const promiseRetry = require('promise-retry')

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
          if (!['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(type)) {
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

module.exports = _.memoize(async function () {
  const result = await promisify(bootstrap)(env.COUCH_URL, 'couchdb', {
    mapDbName: dbname => dbname + (env.isProduction ? '' : '-staging')
  })
  return _(result.push)
    .mapValues((v, name) => new PouchDB(resolve(env.COUCH_URL, name)))
    .mapValues(db => new Proxy(db, retryHandler))
    .mapKeys((v, name) => name.replace('-staging', ''))
    .value()
})
