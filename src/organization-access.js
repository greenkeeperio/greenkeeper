var log = require('npmlog')
var open = require('opener')

var story = require('./lib/story')['organization-access']

module.exports = function (flags) {
  log.verbose('organization-access', 'starting command')

  if (!flags.token) {
    log.info('organization-access', 'Not logged in.')
    process.exit(1)
  }

  story.forEach(function (message) {
    log.info('organization-access', message)
  })
  var url = flags.api + 'login/organization-access'
  log.verbose('organization-access', 'Open ' + url)
  open(url)
}
