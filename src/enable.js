var fs = require('fs')
var path = require('path')
var qs = require('querystring')

var chalk = require('chalk')
var log = require('npmlog')
var open = require('opener')
var request = require('request')
var _ = require('lodash')
var yaml = require('js-yaml')

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

      checkTravisyml(pkg)
    }
    var scoped = _.get(pkg, 'name[0]') === '@'

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
        body: {slug: slug, manual_webhooks: flags.admin === false}
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

          if (data.webhooks_secret) {
            var url = 'https://greenkeeper.io/manual-webhooks.html?' + qs.encode({
              slug: slug,
              secret: data.webhooks_secret
            })
            open(url, function (err, stdout, stderr) {
              if (err) {
                console.log('Get webhooks setup instructions at this URL:', url)
              }
            })
          }

          if (!scoped || flags.slug || flags.postpublish === false) process.exit()

          log.info('enable', 'This is a scoped package.')
          log.info('enable', 'Installing greenkeeper-postpublish module to automatically announce new versions.')

          return postpublish(flags)
        }

        if (data.statusCode === 403) {
          log.error('enable', 'Admin access is required to enable a repository.')
          log.error('enable', 'Please ask an admin on your team to enable Greenkeeper.')
          process.exit(1)
        }

        if (data.statusCode !== 400) {
          log.error('enable', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
          process.exit(2)
        }

        if (isSynced) exitWithError(slug)

        log.verbose('enable', 'Repository not found. Starting a sync.')
        log.info('enable', 'Synchronizing your repositories. This might take a while.')
        sync(flags, function (err, repos) {
          if (err) {
            log.error('enable', 'Synchronizing the repositories was not possible.')
            exitWithError(slug)
          }
          if (_.includes(repos, slug)) {
            log.verbose('enable', 'Repository found after sync. Trying to enable again.')
            return enable(true)
          }
          log.verbose('enable', 'Repository not found after sync.')
          exitWithError(slug)
        })
      })
    }
  }
}

function checkTravisyml (pkg) {
  try {
    var travisyml = yaml.safeLoad(fs.readFileSync(path.join(process.cwd(), '.travis.yml')))
    var onlyBranches = _.get(travisyml, 'branches.only')
    if (!onlyBranches) return

    var branchPrefix = _.get(pkg, 'greenkeeper.branchPrefix', 'greenkeeper-')

    var greenkeeperRule = onlyBranches.some(function (branch) {
      return _.includes(branch, branchPrefix.slice(0, -1))
    })
    if (greenkeeperRule) return

    log.warn('enable', 'Your .travis.yml is configured to only run for specific branches.')
    log.warn('enable', 'For Greenkeeper to work you need to whitelist the Greenkeeper branches.')
    log.warn('enable', 'Add this rule to ' + chalk.yellow('branches.only') + ' in your .travis.yml:')
    log.warn('enable', chalk.yellow('   - /^' + branchPrefix + '.*$/'))
  } catch (e) {
    // ignore missing or malformed yml
  }
}

function exitWithError (slug) {
  log.error('enable', 'Couldn’t enable a repository with slug ' + chalk.yellow(slug) + '.')
  console.log(story.fail())
  process.exit(1)
}
