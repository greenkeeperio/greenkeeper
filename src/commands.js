var _ = require('lodash')
var abbrev = require('abbrev')

var exports = module.exports = [
  'login',
  'logout',
  'enable',
  'disable',
  'info',
  'sync',
  'whoami'
].sort()

exports.aliases = {
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
