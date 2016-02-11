var log = require('npmlog')
var nerfDart = require('nerf-dart')
var open = require('open')
var request = require('request')
var randomString = require('random-string')
var spinner = require('char-spinner')

var getToken = require('./lib/get-token')
var rc = require('./lib/rc')
var story = require('./lib/story').login
var logo = require('./lib/logo')

module.exports = function (flags) {
  logo()
  log.verbose('login', 'starting command')

  if (flags.token && !flags.force) {
    log.error('login', story.error_already_logged_in)
    process.exit(1)
  }

  var id = randomString({length: 32})
  log.verbose('login', 'id', id)

  log.verbose('login', 'Getting token from API and opening GitHub login')

  getToken(flags, id, function (data) {
    rc.set(nerfDart(flags.api) + 'token', data.token)
    // async me! (sing along to moisturize me!)
    log.info('login', 'That was successful, now syncing all your GitHub repositories')

    var spin = spinner()

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
        log.error('login', err.message)
        process.exit(2)
      }

      if (data.error) {
        log.error('login', data.statusCode + '/' + data.error + ': ' + data.message)
        process.exit(2)
      }

      if (data.repos) {
        log.info('login', 'Done syncing ' + data.repos.length + ' repositories')
        console.log('You are now logged in, synced and all set up!')
        log.info('login', 'Find out how to get started with', '$ greenkeeper start')
      }
    })
  })

  var url = flags.api + 'login?id=' + id + (flags['private'] ? '&private=true' : '')

  log.verbose('login', 'Open ' + url)
  open(url)
}
