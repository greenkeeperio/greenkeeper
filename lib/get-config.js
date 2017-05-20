const _ = require('lodash')

module.exports = repository => {
  const config = _.get(
    repository,
    ['packages', 'package.json', 'greenkeeper'],
    {}
  )
  return Object.assign(
    {
      label: 'greenkeeper',
      branchPrefix: 'greenkeeper/',
      ignore: []
    },
    config
  )
}
