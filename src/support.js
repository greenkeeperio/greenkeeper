var log = require('npmlog')
var open = require('open')

module.exports = function (flags) {
  log.verbose('support', 'starting command')

  if (!flags.token) {
    log.info('support', 'Not logged in. Opening the general support repo.')
    open('https://github.com/greenkeeperio/greenkeeper')
    process.exit(1)
  }

  log.info('support', 'Opening Intercom chat in browser')

  open(flags.api + 'support?access_token=' + flags.token)
}
