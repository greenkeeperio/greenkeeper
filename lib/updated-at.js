const _ = require('lodash')

module.exports = function (doc, event) {
  const now = new Date().toJSON()
  if (!doc.createdAt) doc.createdAt = now
  if (event) {
    doc.updatedAt = _([doc.updatedAt, { timestamp: now, event }])
      .flatten()
      .compact()
      .value()
    return doc
  }
  if (Array.isArray(doc.updatedAt)) {
    doc.updatedAt.push(now)
    return doc
  }
  doc.updatedAt = now
  return doc
}
