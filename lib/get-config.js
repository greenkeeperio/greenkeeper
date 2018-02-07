const _ = require('lodash')

module.exports = repository => {
  const config = _.get(
    repository,
    ['packages', 'package.json', 'greenkeeper'],
    {}
  )
  /* eslint-disable no-template-curly-in-string */
  return Object.assign(
    {
      label: 'greenkeeper',
      branchPrefix: 'greenkeeper/',
      ignore: [],
      commitMessages: {
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
    },
    config
  )
  /* eslint-enable no-template-curly-in-string */
}
