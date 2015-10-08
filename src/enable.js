var fs = require('fs')
var path = require('path')

var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').enable

module.exports = function (flags) {
  log.verbose('enable', 'Starting command')

  if (!flags.token) {
    log.error('enable', story.error_login_first)
    process.exit(1)
  }

  if (flags.slug) return enableCommand(null, flags.slug)

  require('github-slug')(process.cwd(), enableCommand)

  function enableCommand (err, slug) {
    if (err) {
      log.error('enable', 'Couldn’t find a GitHub remote "origin" in this folder.\nTry passing the slug explicitly $ greenkeeper enable --slug <user>/<repo>')
    }

    if (!flags.slug && !fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      log.warn('enable', 'No package.json present, you won’t receive pull requests')
    }

    if (!slug) {
      log.error('enable', story.error_missing_slug)
      process.exit(1)
    }

    log.info('enable', 'The GitHub slug is:', slug)

    log.http('enable', 'Sending request')
    request({
      method: 'POST',
      url: flags.api + 'packages',
      json: true,
      headers: {
        Authorization: 'Bearer ' + flags.token
      },
      body: {slug: slug}
    }, function (err, res, data) {
      if (err) {
        log.error('enable', err.message)
        process.exit(2)
      }

      if (!data) {
        return log.error('enable', story.error_no_data)
      }

      if (data.noChange) {
        return log.error('enable', story.error_no_change(slug)) // TODO: We might not need this
      }

      if (data.ok) {
        return console.log(story.enabled(slug))
      }

      if (data.statusCode === 400) {
        log.error('enable', 'Couldn’t enable a project with this slug.')
        log.error('enable', 'The repo has to exist on GitHub, it can’t be a fork and it has to be public,')
        log.error('enable', 'or you have have to have a private plan. To verify run $ greenkeeper whoami')
        log.error('enable', 'If you have just recently created this repo try running $ greenkeeper sync')
        log.error('enable', 'You need admin access to enable repos.')
        log.error('enable', 'If you think this error really shouldn’t appear let us look into it with $ greenkeeper support')
        process.exit(1)
      } else if (data.statusCode === 403) {
        log.error('enable', 'You need a paid greenkeeper.io subscription to enable private repositories\nYou can subscribe via $ greenkeeper upgrade')
        process.exit(1)
      }

      log.error('enable', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
      process.exit(2)
    })
  }
}
