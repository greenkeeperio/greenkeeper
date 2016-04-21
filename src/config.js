var abbrev = require('abbrev')
var chalk = require('chalk')
var log = require('npmlog')

var rc = require('@greenkeeper/flags')._rc

var aliases = abbrev(['get', 'set', 'delete', 'list'])

module.exports = function (flags) {
  var commands = flags.argv.remain
  var command = commands.shift()

  switch (aliases[command]) {
    case 'get':
      return get(commands)
    case 'set':
      return set(commands)
    case 'delete':
      return del(commands)
    case 'list':
      return list(commands)
    default:
      log.error('config', [
        'Usage:',
        chalk.yellow('greenkeeper config set <key> <value>'),
        chalk.yellow('greenkeeper config get [<key>]'),
        chalk.yellow('greenkeeper config delete <key>'),
        chalk.yellow('greenkeeper config list')
      ].join('\n'))
  }
}

function get (commands) {
  if (!commands.length) return list()

  if (commands.length !== 1) return log.error('config', 'Usage: ' + chalk.yellow('greenkeeper config get [<key>]'))

  console.log(rc.get(commands[0]))
}

function set (commands) {
  if (commands[1] == null) commands[1] = true

  if (commands.length !== 2) return log.error('config', 'Usage: ' + chalk.yellow('greenkeeper config set <key> <value>'))

  rc.set.apply(null, commands)
}

function del (commands) {
  if (commands.length !== 1) return log.error('config', 'Usage: ' + chalk.yellow('greenkeeper config delete <key>'))

  rc.unset(commands[0])
}

function list () {
  var config = rc.get()
  Object.keys(config).sort().forEach(function (key) {
    console.log(chalk.bold(key), config[key])
  })
}
