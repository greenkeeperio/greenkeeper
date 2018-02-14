const { defaultCommitMessages } = require('./default-commit-messages')

module.exports = function (commitMessages, key, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, key) &&
  !Object.prototype.hasOwnProperty.call(defaultCommitMessages, key)) {
    throw new Error(`Unknown message key '${key}'`)
  }

  const templateValues = Object.assign({}, values)

  function replaceMessageVariables (message, variables) {
    let replacedString = message

    Object.keys(templateValues).forEach((key) => {
      replacedString = replacedString.replace(`\${${key}}`, variables[key])
    })

    return replacedString
  }

  let commitMessage = replaceMessageVariables(commitMessages[key], templateValues)

  // if someone replaced the varibale name with something else,
  // return the default message for that key
  if (commitMessage.match(/\${.+?}/)) {
    commitMessage = replaceMessageVariables(defaultCommitMessages[key], templateValues)
  }

  return commitMessage
}
