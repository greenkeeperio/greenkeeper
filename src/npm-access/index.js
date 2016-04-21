var chalk = require('chalk')
var log = require('npmlog')
var request = require('request')

var dialog = require('./dialog')

module.exports = function (flags) {
  log.verbose('npm-access', 'starting command')

  if (!flags.token) {
    log.error('npm-access', 'Login required. Run ' + chalk.yellow('greenkeeper login'))
    process.exit(1)
  }

  log.info('npm-access', 'Your machine will talk directly to the npm registry to generate an npm token.\nYour npm password is not sent to Greenkeeper servers.')

  if (!flags.organization) {
    log.info('npm-access', 'If you want to grant access for an organization run ' + chalk.yellow('greenkeeper npm-access --organization=<name>'))
  }

  log.silly('npm-access', 'starting dialog')
  dialog(function (err, token) {
    if (err) {
      log.error('npm-access', 'Failed to get token from user.')
      process.exit(1)
    }

    log.http('npm-access', 'Sending request')
    request({
      method: 'POST',
      url: flags.api + 'npm',
      json: true,
      headers: {
        Authorization: 'Bearer ' + flags.token
      },
      body: {
        token: token,
        organization: flags.organization
      }
    }, function (err, res, data) {
      if (err) {
        log.error('npm-access', err.message)
        process.exit(2)
      }

      if (!data.username) {
        log.error('npm-access', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
        process.exit(2)
      }

      console.log('Authenticated with npm. Token was successfully uploaded.')
    })
  })
}
