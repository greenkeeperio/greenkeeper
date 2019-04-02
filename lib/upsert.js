const _ = require('lodash')

const updatedAt = require('./updated-at')

module.exports = async function (db, id, diff, keep) {
  let doc
  // upsert(docId, diffFun, cb, hasTimeout)
  await db.upsert(id, (old = {}) => {
    const keptOldValues = _.pick(old, keep)
    doc = updatedAt(Object.assign(old, diff, keptOldValues))
    return doc
  }, null, true)

  return doc
}
