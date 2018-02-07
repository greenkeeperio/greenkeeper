const template = require('es6-template-strings')

module.exports = async function (commitMessages, key, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, key)) {
    throw new Error(`Unknown message key '${key}'`)
  }

  const templateValues = Object.assign({}, values)

  return template(commitMessages[key], templateValues)
}
