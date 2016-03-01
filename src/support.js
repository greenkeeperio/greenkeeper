var log = require('npmlog')
var open = require('opener')

module.exports = function (flags) {
  log.verbose('support', 'starting command')

  if (!flags.token) {
    log.info('support', 'Not logged in. Opening GitHub issues.')
    open('https://github.com/greenkeeperio/greenkeeper')
    process.exit(1)
  }

  log.info('support', 'Opening GitHub issues (free plan) or Intercom')

  open(flags.api + 'support?access_token=' + flags.token)
}
