const { defaultCommitMessages } = require('./default-commit-messages')

function replaceMessageVariables (message, variables) {
  let replacedString = message

  Object.keys(variables).forEach((key) => {
    replacedString = replacedString.replace(`\${${key}}`, variables[key])
  })

  return replacedString
}

module.exports = function (commitMessages, messageKey, values) {
  // If no custom messages are defined in the users config
  // both calls check the same commitMessages Object.
  // But if the user only defines a subset of the possible custom messages
  // the error was falsy thrown.
  if (!Object.prototype.hasOwnProperty.call(commitMessages, messageKey) &&
  !Object.prototype.hasOwnProperty.call(defaultCommitMessages, messageKey)) {
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
