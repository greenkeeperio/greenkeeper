var chalk = require('chalk')
var log = require('npmlog')
var nerfDart = require('nerf-dart')
var open = require('opener')
var randomString = require('random-string')

var getToken = require('./lib/get-token')
var rc = require('./lib/rc')
var story = require('./lib/story').login
var logo = require('./lib/logo')
var sync = require('./lib/sync')

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
    log.info('login', 'That was successful, now syncing all your GitHub repositories')
    flags.token = data.token
    sync(flags, function (err, repos) {
      if (err) {
        log.error('login', err.message)
        process.exit(2)
      }
      log.info('login', 'Done syncing ' + repos.length + ' repositories')
      console.log('You are now logged in, synced and all set up!')
      log.info('login', 'Find out how to get started with', '' + chalk.yellow('greenkeeper start'))
    })
  })

  var url = flags.api + 'login?id=' + id + (flags['private'] ? '&private=true' : '')

  log.verbose('login', 'Open ' + url)
  open(url)
}
