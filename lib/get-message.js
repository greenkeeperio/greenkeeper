const { defaultCommitMessages, defaultPRTitles } = require('./default-config-messages')

function replaceVariables (message, variables) {
  let replacedString = message

  Object.keys(variables).forEach((key) => {
    replacedString = replacedString.replace(`\${${key}}`, variables[key])
  })

  return replacedString
}

function getMessage (commitMessages, messageKey, values) {
  if (!Object.prototype.hasOwnProperty.call(commitMessages, messageKey)) {
    throw new Error(`Unknown message messageKey '${messageKey}'`)
  }

  // get rid of null and undefined
  const templateValues = Object.assign({}, values)

  let commitMessage = replaceVariables(commitMessages[messageKey], templateValues)

  // if someone replaced the variable name with something else,
  // return the default message for that messageKey
  if (commitMessage.match(/\${.+?}/)) {
    commitMessage = replaceVariables(defaultCommitMessages[messageKey], templateValues)
  }

  return commitMessage
}

function getPRTitle ({version, dependency, group, prTitles}) {
  const variables = {dependency, group}

  if (!prTitles[version]) {
    throw new Error('exited: Unknown PR key')
  }

  let PRTitle = replaceVariables(prTitles[version], variables)
  // if someone replaced the variable name with something else,
  // return the default message for that messageKey
  if (PRTitle.match(/\${.+?}/)) {
    PRTitle = replaceVariables(defaultPRTitles[version], variables)
  }

  return PRTitle
}

module.exports = {
  getMessage,
  getPRTitle
}
