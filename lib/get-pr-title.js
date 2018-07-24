module.exports = function ({version, dependency, group, customTitle}) {
  const defaultPRTitle = {
    basicPR: `Update ${dependency} to the latest version 🚀`,
    groupPR: `Update ${dependency} in group ${group} to the latest version 🚀`
  }

  if (!customTitle) return defaultPRTitle[version]

  return 'custom PR Title'
}
