var log = require('npmlog')
var open = require('open')

module.exports = function (flags) {
  log.verbose('whoami', 'starting command')

  if (!flags.token) process.exit(1)

  log.info('support', 'Opening Intercom chat in browser')

  open(flags.api + 'support?access_token=' + flags.token)
}
