const _ = require('lodash')
const { defaultCommitMessages } = require('./default-commit-messages')

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
      commitMessages: defaultCommitMessages
    },
    config
  )
  /* eslint-enable no-template-curly-in-string */
}
