var log = require('npmlog')

var story = require('./lib/story').sync
var sync = require('./lib/sync')

module.exports = function (flags) {
  log.verbose('sync', 'starting command')

  if (!flags.token) {
    log.error('sync', story.error_no_login_first)
    process.exit(1)
  }

  log.http('sync', 'Sending request')
  log.info('sync', 'This might take a while')
  sync(flags, function (err, repos) {
    if (err) {
      log.error('sync', err.message)
      process.exit(2)
    }
    console.log(repos.sort().join('\n'))
  })
}
