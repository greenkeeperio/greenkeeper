var log = require('npmlog')
var open = require('open')
var request = require('request')

function usage () {
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

  var url = 'https://fastspring.com/greenkeeper.io/'
  switch (argv.remain[0]) {
    case 'supporter':
      url += 'supporter'
      break
    case 'personal':
      url += 'personal'
      break
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

  request({
    method: 'POST',
    json: true,
    url: flags.api + 'payment/wait',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: flags.token,
      plan: url
    }
  }, function (err, res, data) {
    if (err) {
      log.error('login', 'Payment failed', err)
      process.exit(1)
    }

    if (!(res.statusCode === 200 && data.token)) {
      log.error('login', 'Payment failed', res, data)
      process.exit(1)
    }

    console.log('Payment Successful! Team greenkeeper says thank you! <3')
    console.log('Stephan, Christoph, Alex, Gregor, Jan & Ola')
  })

  log.verbose('buy', 'Opening url ' + url)
  open(url)
}
