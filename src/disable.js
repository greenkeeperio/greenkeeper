var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').disable

module.exports = function (flags) {
  log.verbose('disable', 'Starting command')

  if (!flags.token) {
    log.error('disable', story.error_login_first)
    process.exit(1)
  }

  if (flags.slug) return disableCommand(null, flags.slug)

  require('github-slug')(process.cwd(), disableCommand)

  function disableCommand (err, slug) {
    if (err) {
      log.error('disable', 'Couldn\'t find a remote GitHub repository in this folder.\nTry passing the slug explicitly $ greenkeeper enable --slug <user>/<repo>')
    }

    if (!slug) {
      log.error('disable', story.error_missing_slug)
      process.exit(1)
    }

    log.info('disable', story.repo_info(slug))

    log.http('disable', 'Sending request')
    request({
      method: 'DELETE',
      url: flags.api + 'packages',
      json: true,
      headers: {
        Authorization: 'Bearer ' + flags.token
      },
      body: {slug: slug}
    }, function (err, res, data) {
      if (err) {
        log.error('disable', err.message)
        process.exit(2)
      }

      if (!data) {
        log.error('disable', story.error_no_data)
        process.exit(2)
      }

      if (data.noChange) {
        return log.error('disable', story.error_no_change(slug)) // TODO: We might not need this
      }

      if (data.ok) {
        return console.log(story.disabled(slug))
      }

      log.error('disable', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
      process.exit(2)
    })
  }
}
