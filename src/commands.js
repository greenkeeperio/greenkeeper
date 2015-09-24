var _ = require('lodash')
var abbrev = require('abbrev')

var exports = module.exports = [
  'login',
  'logout',
  'enable',
  'disable',
  'info',
  'sync',
  'whoami',
  'support',
  'evilhackerdude',
  'lewis',
  'upgrade',
  'start'
].sort()

exports.secrets = [
  'evilhackerdude',
  'lewis'
]

exports.aliases = {
  downgrade: 'support',
  cancel: 'support',
  unsubscribe: 'support',
  pay: 'upgrade',
  buy: 'upgrade',
  subscribe: 'upgrade',
  ehd: 'evilhackerdude',
  chat: 'support',
  signup: 'login',
  signin: 'login',
  signout: 'logout',
  on: 'enable',
  off: 'disable'
}

exports.all = _.mapValues(
  abbrev(exports.concat(Object.keys(exports.aliases))),
  function (cmd) {
    return exports.aliases[cmd] || cmd
  }
)
