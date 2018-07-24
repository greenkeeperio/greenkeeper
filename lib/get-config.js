const _ = require('lodash')
const mergejson = require('mergejson')
const { defaultCommitMessages, defaultPRTitles } = require('./default-config-messages')

module.exports = repository => {
  const greenkeeperConfig = _.get(repository, 'greenkeeper', {})
  const packageJSONConfig = _.get(repository, ['packages', 'package.json', 'greenkeeper'], {})

  const mergedConfig = mergejson(greenkeeperConfig, packageJSONConfig)

  // Make a copy instead of mutating the original repoDoc config!
  return _.defaultsDeep(JSON.parse(JSON.stringify(mergedConfig)), {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    commitMessages: defaultCommitMessages,
    prTitles: defaultPRTitles
  })
}
