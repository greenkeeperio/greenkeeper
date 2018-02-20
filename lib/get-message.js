const { defaultCommitMessages } = require('./default-commit-messages')

function replaceMessageVariables (message, variables) {
  let replacedString = message

  Object.keys(variables).forEach((key) => {
    replacedString = replacedString.replace(`\${${key}}`, variables[key])
  })

  return replacedString
}

module.exports = function (commitMessages, messageKey, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, messageKey) &&
  !Object.prototype.hasOwnProperty.call(defaultCommitMessages, messageKey)) {
    throw new Error(`Unknown message messageKey '${messageKey}'`)
  }

  const templateValues = Object.assign({}, values)

  let commitMessage = replaceMessageVariables(commitMessages[messageKey], templateValues)

  // if someone replaced the varibale name with something else,
  // return the default message for that messageKey
  if (commitMessage.match(/\${.+?}/)) {
    commitMessage = replaceMessageVariables(defaultCommitMessages[messageKey], templateValues)
  }

  return commitMessage
}
