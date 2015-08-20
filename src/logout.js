var log = require('npmlog')
var open = require('open')
var request = require('request')
var randomString = require('random-string')

var rc = require('./lib/rc')

module.exports = function (flags) {
  log.verbose('logout', 'starting command')

  if (!flags.token) {
    log.error('logout', 'Already logged out.')
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
    if (data.ok) {
      rc.unset('token')
      return console.log('Logged out')
    }

    log.error('logout', err || res)
    process.exit(1)
  })
}
