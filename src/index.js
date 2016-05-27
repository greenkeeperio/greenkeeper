#!/usr/bin/env node

var emoji = require('node-emoji')
var hideSecrets = require('hide-secrets')
var log = require('npmlog')
var isURL = require('valid-url').isWebUri

var pkg = require('../package.json')
var story = require('./lib/story')
var commands = require('./commands')

var flags = require('@greenkeeper/flags')

if (require.main === module) {
  require('set-blocking')(true)
  greenkeeper()
} else {
  module.exports = greenkeeper
}

function greenkeeper () {
  if (pkg.version !== '0.0.0-placeholder') require('update-notifier')({pkg: pkg}).notify()

  log.levels.http = 1500

  log.level = flags.loglevel || 'info'
  log.headingStyle = {fg: 'white'}
  log.heading = process.platform === 'darwin' ? emoji.get('palm_tree') + ' ' : ''

  log.verbose('cli', 'arguments', hideSecrets(flags))

  if (flags.version) {
    console.log(pkg.version || 'development')
    process.exit(0)
  }

  var command = commands.all[((flags.argv.remain || []).shift() || '').toLowerCase()]

  if (flags.help || !command) {
    process.stdout.write(story.usage())
    process.exit(0)
  }

  if (flags.force) log.warn('cli', 'using --force')

  if (!flags.force && command !== 'config' && !isURL(flags.api)) {
    log.error('cli', 'API endpoint is not a valid URL.', flags.api)
    process.exit(1)
  }

  process.on('exit', function (code) {
    if (code !== 2) return

    var chalk = require('chalk')
    log.error('unknown', 'Uhm, this was an unexpected error. Please try again.')
    log.error('unknown', 'If this keeps reappearing – please let us know ' + chalk.yellow('greenkeeper support'))
  })

  require('./' + command)(flags, pkg)
}
