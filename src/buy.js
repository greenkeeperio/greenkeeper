var log = require('npmlog')
var open = require('open')

var rc = require('./lib/rc')

function usage() {
  log.error('Please use one of these commands: \n\n' + [
    'greenkeeper buy supporter ($5 / month, fast queue)',
    'greenkeeper buy personal ($14 / month, infinite repos, faster queue)',
    'greenkeeper buy organisation 25 ($50 / month, 25 repos, fastest queue)',
    'greenkeeper buy organisation 50 ($90 / month, 50 repos, fastest queue)',
    '\n# if you need more repos, emails us at hi@greenkeeper.io'
  ].join('\n'))
  process.exit(1)
}

module.exports = function (flags) {
  log.verbose('buy', 'starting command')

  if (!flags.token && !flags.force) {
    log.error('buy', 'Please log in first.')
    process.exit(1)
  }

  const argv = flags.argv
  if (!argv.remain || !argv.remain[0]) {
    return usage()
  }

  var url = 'https://fastspring.com/greenkeeper.io/';
  switch(argv.remain[0]) {
    case 'supporter':
      url += 'supporter'
      break;
    case 'personal': 
      url += 'personal'
      break;
    case 'organisation':
      // require 25 or 50 option
      if (typeof argv.remain[1] === 'undefined' || ['25', '50'].indexOf(argv.remain[1]) === -1) {
        return usage()
      }
      const numberOfRepos = argv.remain[1]
      url += 'organisation-' + numberOfRepos
      break
    default:
      return usage()
  }

  log.verbose('buy', 'Opening url ' + url)
  open(url)
}
