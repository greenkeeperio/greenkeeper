var log = require('npmlog')
var request = require('request')

var rc = require('./lib/rc')
var story = require('./lib/story').logout

module.exports = function (flags) {
  log.verbose('logout', 'starting command')

  if (!flags.token) {
    log.error('logout', story.error_already_logged_in)
    process.exit(1)
  }

  log.http('logout', 'Sending request')
  request({
    method: 'DELETE',
    json: true,
    url: flags.api + 'tokens',
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('logout', err.message)
      process.exit(2)
    }

    if (data.ok) {
      rc.unset('token')
      return console.log(story.logged_out)
    }

    log.error('logout', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
    process.exit(2)
  })
}
