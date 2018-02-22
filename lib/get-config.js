const _ = require('lodash')
const { defaultCommitMessages } = require('./default-commit-messages')

module.exports = repository => {
  const config = _.has(repository, 'greenkeeper')
  ? _.get(repository, 'greenkeeper')
  : _.get(
    repository,
    ['packages', 'package.json', 'greenkeeper'],
    {}
  )

  return _.defaultsDeep(config, {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    commitMessages: defaultCommitMessages
  })
}
