var log = require('npmlog')
var open = require('open')

var story = require('./lib/story').logout

module.exports = function (flags) {
  log.verbose('whoami', 'starting command')

  if (!flags.token) {
    log.error('sync', story.error_no_login_first)
    process.exit(1)
  }

  log.info('support', 'Opening Intercom chat in browser')

  open(flags.api + 'support?access_token=' + flags.token)
}
