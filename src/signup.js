var open = require('opener')
var log = require('npmlog')

module.exports = function (flags) {
  log.verbose('signup', 'starting command')

  log.info('signup', 'Signing up for the old Greenkeeper oAuth application is no longer supported.')
  log.info('signup', 'Opening the new GitHub Integration instead.')

  open('https://git.io/uptodate')
}
