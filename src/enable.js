var fs = require('fs')
var path = require('path')

var chalk = require('chalk')
var log = require('npmlog')
var request = require('request')
var _ = require('lodash')

var story = require('./lib/story').enable
var sync = require('./lib/sync')
var postpublish = require('./postpublish')

module.exports = function (flags) {
  log.verbose('enable', 'Starting command')

  if (!flags.token) {
    log.error('enable', story.error_login_first)
    process.exit(1)
  }

  if (flags.slug) return enableCommand(null, flags.slug)

  require('github-slug')(process.cwd(), enableCommand)

  function enableCommand (err, slug) {
    if (err || !slug) {
      log.error('enable', 'Couldn’t find a GitHub remote "origin" in this folder.\nTry passing the slug explicitly ' + chalk.yellow('greenkeeper enable --slug <user>/<repository>'))
      process.exit(1)
    }

    var pkg = {}
    if (!flags.slug) {
      try {
        pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')))
      } catch (e) {
        log.warn('enable', 'No package.json present, you won’t receive pull requests')
      }
    }
    var scoped = pkg && pkg.name && pkg.name.charAt(0) === '@'

    log.info('enable', 'The GitHub slug is:', slug)

    enable(false)

    function enable (isSynced) {
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
          console.log(story.enabled(slug))
          if (!scoped || flags.slug || flags.postpublish === false) process.exit()

          log.info('enable', 'This is a scoped package.')
          log.info('enable', 'Installing greenkeeper-postpublish module to automatically announce new versions.')

          return postpublish(flags)
        }

        if (data.statusCode === 403) {
          log.error('enable', 'You need a paid greenkeeper.io subscription to enable private repositories\nYou can subscribe via ' + chalk.yellow('greenkeeper upgrade'))
          process.exit(1)
        }

        if (data.statusCode !== 400) {
          log.error('enable', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
          process.exit(2)
        }

        if (isSynced) exitWithError()

        log.verbose('enable', 'Repository not found. Starting a sync.')
        log.info('enable', 'Synchronizing your repositories. This might take a while.')
        sync(flags, function (err, repos) {
          if (err) {
            log.error('enable', 'Synchronizing the repositories was not possible.')
            exitWithError()
          }
          if (_.includes(repos, slug)) {
            log.verbose('enable', 'Repository found after sync. Trying to enable again.')
            return enable(true)
          }
          log.verbose('enable', 'Repository not found after sync.')
          exitWithError()
        })
      })
    }
  }
}

function exitWithError () {
  log.error('enable', 'Couldn’t enable a repository with this slug.')
  log.error('enable', 'If you want to try your free private repository make sure to grant the necessary rights by running ' + chalk.yellow('greenkeeper login --force --private'))
  log.error('enable', 'You have to have a plan for more than one private repository. To verify run ' + chalk.yellow('greenkeeper whoami'))
  log.error('enable', 'You need admin access to a repository to enable it.')
  log.error('enable', 'If you think this error really shouldn’t appear let us look into it with ' + chalk.yellow('greenkeeper support'))
  process.exit(1)
}
