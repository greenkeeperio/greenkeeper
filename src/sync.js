var log = require('npmlog')
var request = require('request')
var spinner = require('char-spinner')

var story = require('./lib/story').sync

module.exports = function (flags) {
  log.verbose('sync', 'starting command')

  if (!flags.token) {
    log.error('sync', story.error_no_login_first)
    process.exit(1)
  }

  log.http('sync', 'Sending request')
  log.info('sync', 'This might take a while')
  var spin = spinner()
  request({
    method: 'POST',
    url: flags.api + 'sync',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    clearInterval(spin)
    if (err) {
      log.error('sync', err.message)
      process.exit(2)
    }

    if (data.repos) {
      return story.repos(data.repos)
    }

    log.error('sync', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
    process.exit(2)
  })
}
