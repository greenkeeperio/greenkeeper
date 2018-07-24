/* eslint-disable no-template-curly-in-string */
const defaultCommitMessages = {
  addConfigFile: 'chore: add Greenkeeper config file',
  updateConfigFile: 'chore: update Greenkeeper config file',
  initialBadge: 'docs(readme): add Greenkeeper badge',
  initialDependencies: 'chore(package): update dependencies',
  initialBranches: 'chore(travis): whitelist greenkeeper branches',
  dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
  devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
  dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
  devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
  // Conditionally appended to dependencyUpdate
  closes: '\n\nCloses #${number}'
}

const defaultPRTitles = {
  basicPR: 'Update ${dependency} to the latest version 🚀',
  groupPR: 'Update ${dependency} in group ${group} to the latest version 🚀'
}
/* eslint-enable no-template-curly-in-string */

module.exports = { defaultCommitMessages, defaultPRTitles }
