var _ = require('lodash')
var chalk = require('chalk')
var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  log.verbose('list', 'starting command')

  if (!flags.token) {
    log.error('list', 'Login required. Run ' + chalk.yellow('greenkeeper login'))
    process.exit(1)
  }

  log.http('list', 'Sending request')
  request({
    url: flags.api + 'packages',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('list', err.message)
      process.exit(2)
    }

    if (!data.packages) {
      log.error('list', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
      process.exit(2)
    }

    if (!data.packages.length) {
      log.error('list', 'No repositories enabled yet')
    }
    _.orderBy(data.all, ['is_enabler', 'name'], ['desc', 'asc'])
    .forEach(function (repo) {
      if (!repo.enabled) return
      console.log(repo.name, repo.is_enabler ? chalk.green('(enabled by you)') : '')
    })
  })
}
