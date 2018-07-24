const { defaultPRTitles } = require('./default-config-messages')

function replaceVariables (message, variables) {
  let replacedString = message

  Object.keys(variables).forEach((key) => {
    replacedString = replacedString.replace(`\${${key}}`, variables[key])
  })

  return replacedString
}

module.exports = function ({version, dependency, group, customTitles}) {
  const variables = {dependency, group}
  if (!customTitles) return replaceVariables(defaultPRTitles[version], variables)

  if (!customTitles[version]) {
    throw new Error('exited: Unknown PR key')
  }

  return replaceVariables(customTitles[version], variables)
}
