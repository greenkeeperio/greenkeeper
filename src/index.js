#!/usr/bin/env node

var url = require('url')

var _ = require('lodash')
var emoji = require('node-emoji')
var hideSecrets = require('hide-secrets')
var log = require('npmlog')
var nopt = require('nopt')

var rc = require('./lib/rc')
var pkg = require('../package.json')
var commands = require('./commands')

var rcFlags = rc.get()

var cliFlags = nopt({
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

log.level = cliFlags.loglevel || rcFlags.loglevel || 'info'
log.headingStyle = {fg: 'white'}
log.heading = emoji.get('palm_tree')

var flags = _.assign({}, rcFlags, cliFlags)

flags.api = url.parse(flags.api || 'https://api.greenkeeper.io/').format()

log.silly('cli', 'rc arguments', _.omit(hideSecrets(rcFlags), 'argv'))
log.silly('cli', 'cli arguments', _.omit(hideSecrets(cliFlags), 'argv'))
log.verbose('cli', 'arguments', _.omit(hideSecrets(flags), 'argv'))

if (flags.version) {
  console.log(pkg.version || 'development')
  process.exit(0)
}

var command = commands.all[(flags.argv.remain || ['']).shift().toLowerCase()]

if (flags.help || !command) {
  console.log('Usage: greenkeeper <command>\n')
  console.log('where <command> is one of:')
  console.log('    ', commands.join(', '))
  console.log('\n' + emoji.get('palm_tree'))
  process.exit(0)
}

if (flags.force) log.warn('cli', 'using --force')

require('./' + command)(flags, pkg)
