var log = require('npmlog')
var open = require('open')
var request = require('request')
var randomString = require('random-string')
var spinner = require('char-spinner')

var rc = require('./lib/rc')
var story = require('./lib/story').login

module.exports = function (flags) {
  log.verbose('login', 'starting command')

  if (flags.token && !flags.force) {
    log.error('login', story.error_already_logged_in)
    process.exit(1)
  }

  var id = randomString({length: 16})
  log.verbose('login', 'id', id)

  log.verbose('login', 'Getting token from API and opening GitHub login')
  var spin = spinner()
  request({
    method: 'POST',
    json: true,
    url: flags.api + 'tokens',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: id
    }
  }, function (err, res, data) {
    if (err) {
      log.error('login', story.request_failed(err))
      process.exit(1)
    }

    if (!(res.statusCode === 200 && data.token)) {
      log.error('login', story.login_failed(res))
      process.exit(1)
    }

    rc.set('token', data.token)

    // async me! (sing along to moisturize me!)
    log.info('sync', 'Syncing your GitHub, it’ll only be a minute!')
    request({
      method: 'POST',
      url: flags.api + 'sync',
      json: true,
      headers: {
        Authorization: 'Bearer ' + data.token
      }
    }, function (err, res, data) {
      clearInterval(spin)

      if (err) {
        return log.error('sync', err)
      }
      if (data.repos) {
        console.log('Done synching ' + data.repos.length + ' repositories.')
        console.log('You are now logged in, synced and all set up!')
      }
    })
  })

  var url = flags.api + 'login?id=' + id

  log.verbose('login', 'Open ' + url)
  open(url)
}
