var qs = require('querystring')

var chalk = require('chalk')
var log = require('npmlog')
var nerfDart = require('nerf-dart')
var open = require('opener')
var randomString = require('random-string')
var _ = require('lodash')

var getToken = require('./lib/get-token')
var rc = require('@greenkeeper/flags')._rc
var story = require('./lib/story').login
var logo = require('./lib/logo')
var sync = require('./lib/sync')
var checkEnterprise = require('./lib/check-enterprise.js')

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
    rc.set('api', flags.api)
    rc.set(nerfDart(flags.api) + 'token', data.token)
    rc.set(nerfDart(flags.api) + 'admin', flags.admin)

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

  if (!flags['private'] && !_.has(flags, 'private')) {
    return checkEnterprise(function (err, flags, isEnterprise) {
      if (err) {
        log.error('login', err.message)
        process.exit(2)
      }
      openAuth(isEnterprise)
    })(flags)
  }

  openAuth(flags['private'])

  function openAuth (pvt) {
    var query = {
      id: id,
      private: pvt
    }

    if (flags.admin === false) {
      query.no_admin = true
      query.access_token = flags.token
    }

    var url = flags.api + 'login?' + qs.encode(query)

    log.verbose('login', 'Open ' + url)
    open(url, function (err, stdout, stderr) {
      if (err) {
        console.log('Login from this URL:', url)
      }
    })
  }
}
