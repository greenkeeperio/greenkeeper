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
  'start',
  'list',
  'organization-access',
  'config',
  'npm-access',
  'npm-verify',
  'postpublish',
  'faq'
].sort()

exports.secrets = [
  'evilhackerdude',
  'lewis'
]

exports.aliases = {
  ls: 'list',
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
  status: 'info',
  init: 'enable',
  on: 'enable',
  off: 'disable',
  access: 'organization-access',
  'organisation-access': 'organization-access',
  'org-access': 'organization-access'
}

exports.all = _.mapValues(
  abbrev(exports.concat(Object.keys(exports.aliases))),
  function (cmd) {
    return exports.aliases[cmd] || cmd
  }
)
