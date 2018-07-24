const { defaultCommitMessages } = require('./default-config-messages')

function replaceMessageVariables (message, variables) {
  let replacedString = message

  Object.keys(variables).forEach((key) => {
    replacedString = replacedString.replace(`\${${key}}`, variables[key])
  })

  return replacedString
}

module.exports = function (commitMessages, messageKey, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, messageKey)) {
    throw new Error(`Unknown message messageKey '${messageKey}'`)
  }

  // get rid of null and undefined
  const templateValues = Object.assign({}, values)

  let commitMessage = replaceMessageVariables(commitMessages[messageKey], templateValues)

  // if someone replaced the variable name with something else,
  // return the default message for that messageKey
  if (commitMessage.match(/\${.+?}/)) {
    commitMessage = replaceMessageVariables(defaultCommitMessages[messageKey], templateValues)
  }

  return commitMessage
}
