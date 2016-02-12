var chalk = require('chalk')
var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').info

module.exports = function (flags) {
  log.verbose('info', 'Starting command')

  if (!flags.token) {
    log.error('info', story.error_login_first)
    process.exit(1)
  }

  if (flags.slug) return infoCommand(null, flags.slug)

  require('github-slug')(process.cwd(), infoCommand)

  function infoCommand (err, slug) {
    if (err || !slug) {
      log.error('disable', 'Couldn\'t find a remote GitHub repository in this folder.\nTry passing the slug explicitly ' + chalk.yellow('greenkeeper enable --slug <user>/<repository>'))
      process.exit(1)
    }

    log.info('info', 'The GitHub slug is:', slug)

    log.http('info', 'Sending request')
    request({
      method: 'GET',
      url: flags.api + 'packages/' + slug,
      json: true,
      headers: {
        Authorization: 'Bearer ' + flags.token
      }
    }, function (err, res, data) {
      if (err) {
        log.error('info', err.message)
        process.exit(2)
      }

      if (data.disabled) {
        log.error('info', 'greenkeeper isn’t enabled for this repository')
        process.exit(1)
      }

      if (data.statusCode === 400) {
        log.error('info', 'Couldn’t find a repository with this slug.')
        log.error('info', 'The repository has to exist on GitHub and it has to be public,')
        log.error('info', 'or you have to have to have a private plan. To verify run ' + chalk.yellow('greenkeeper whoami'))
        log.error('info', 'If you have just recently created this repository try running ' + chalk.yellow('greenkeeper sync'))
        log.error('info', 'You need admin access to enable repositories.')
        log.error('info', 'If you think this error really shouldn’t appear let us look into it with ' + chalk.yellow('greenkeeper support'))
        process.exit(1)
      }

      if (data.statusCode === 409) {
        log.error('info', 'Conflict! We appear to have this repository in our system several times\nThis can happen if you have moved or recreated the repository\nWe can fix this though, please contact us at ' + chalk.yellow('greenkeeper support'))
        process.exit(1)
      }

      if (data.error) {
        log.error('info', data.error)
        process.exit(2)
      }

      console.log('greenkeeper is enabled for this repository')
    })
  }
}
