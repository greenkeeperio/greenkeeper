var log = require('npmlog')
var open = require('open')
var request = require('request')
var randomString = require('random-string')

var rc = require('./lib/rc')

module.exports = function (config) {
  log.verbose('login', 'starting command')

  if (config.token && !config.force) {
    log.error('login', 'Already logged in. Use --force to continue.')
    process.exit(1)
  }

  var id = randomString({length: 16})
  log.verbose('login', 'id', id)

  log.verbose('login', 'Getting token from API and opening GitHub login')
  request({
    method: 'POST',
    json: true,
    url: config.api + 'tokens',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: id
    }
  }, function (err, res, data) {
    if (err) return log.error('login', 'Request failed', err)

    if (!(res.statusCode === 200 && data.token)) {
      return log.error('login', 'Login failed', res, data)
    }

    rc.set('token', data.token)
    log.info('login', 'Logged in')
  })

  var url = config.api + 'login?id=' + id

  log.info('login', 'Open ' + url)
  open(url)
}
