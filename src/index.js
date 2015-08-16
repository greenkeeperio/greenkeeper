#!/usr/bin/env node

var nopt = require('nopt')
var log = require('npmlog')
var emoji = require('node-emoji')

var commands = require('./commands')
var pkg = require('../package.json')

var parsed = nopt({
  version: Boolean,
  help: Boolean,
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

log.level = parsed.loglevel || 'warn'
log.headingStyle = {fg: 'white'}
log.heading = emoji.get('palm_tree')

if (parsed.version) {
  console.log(pkg.version || 'development')
  process.exit(0)
}

var command = commands.all[(parsed.argv.remain || []).shift().toLowerCase()]

if (parsed.help || !command) {
  console.log('Usage: greenkeeper <command>\n')
  console.log('where <command> is one of:')
  console.log('    ', commands.join(', '))
  process.exit(0)
}

require('./' + command)(parsed, pkg)
