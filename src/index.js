#!/usr/bin/env node

var url = require('url')

var _ = require('lodash')
var emoji = require('node-emoji')
var hideSecrets = require('hide-secrets')
var nerfDart = require('nerf-dart')
var log = require('npmlog')
var nopt = require('nopt')

var rc = require('./lib/rc')
var pkg = require('../package.json')
var story = require('./lib/story')
var commands = require('./commands')

if (pkg.version) require('update-notifier')({pkg: pkg}).notify()

var rcFlags = rc.get()

var cliFlags = nopt({
  private: Boolean,
  slug: String,
  version: Boolean,
  help: Boolean,
  api: String,
  loglevel: [
    'silly',
    'verbose',
    'info',
    'http',
    'warn',
    'error',
    'silent'
  ]
}, {
  h: '--help',
  usage: '--help',
  v: '--version',
  s: ['--loglevel', 'silent'],
  d: ['--loglevel', 'info'],
  dd: ['--loglevel', 'verbose'],
  ddd: ['--loglevel', 'silly'],
  silent: ['--loglevel', 'silent'],
  verbose: ['--loglevel', 'verbose'],
  quiet: ['--loglevel', 'warn']
})

log.levels.http = 1500

log.level = cliFlags.loglevel || rcFlags.loglevel || 'info'
log.headingStyle = {fg: 'white'}
log.heading = process.platform === 'darwin' ? emoji.get('palm_tree') + ' ' : ''

var flags = _.assign({}, rcFlags, cliFlags)

flags.api = url.parse(flags.api || 'https://api.greenkeeper.io/').format()
flags.token = rc.get()[nerfDart(flags.api) + 'token'] || flags.token

log.silly('cli', 'rc arguments', _.omit(hideSecrets(rcFlags), 'argv'))
log.silly('cli', 'cli arguments', _.omit(hideSecrets(cliFlags), 'argv'))
log.verbose('cli', 'arguments', _.omit(hideSecrets(flags), 'argv'))

if (flags.version) {
  console.log(pkg.version || 'development')
  process.exit(0)
}

var command = commands.all[((flags.argv.remain || []).shift() || '').toLowerCase()]

if (flags.help || !command) {
  console.log(story.usage(commands))
  process.exit(0)
}

if (flags.force) log.warn('cli', 'using --force')

process.on('exit', function (code) {
  if (code !== 2) return

  log.error('unexpected', 'Uhm, this was an unexpected error. Please try again.')
  log.error('unexpected', 'If this keeps reappearing – please let us know $ gk support')
})

require('./' + command)(flags, pkg)
