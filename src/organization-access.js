var log = require('npmlog')
var open = require('open')

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

  log.verbose('organization-access', 'https://git.io/greenkeeper-app')
  open('https://git.io/greenkeeper-app')
}
