const _ = require('lodash')

module.exports = async function (commitMessages, key, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, key)) {
    throw new Error(`Unknown message key '${key}'`)
  }

  const templateValues = Object.assign({}, values)

  return _.template(commitMessages[key])(templateValues)
}
