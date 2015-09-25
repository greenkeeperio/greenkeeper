module.exports = function (flags) {
  var log = require('npmlog')
  var open = require('open')
  var request = require('request')
  var querystring = require('querystring')
  var randomString = require('random-string')

  function usage () {
    console.log('Please use one of these commands: \n\n' + [
      '    For  $5/month, fast queue, public repos: $ greenkeeper upgrade supporter',
      '    For $14/month, faster queue,  all repos: $ greenkeeper upgrade personal',
      '    For $50/month, fastest queue,  25 repos: $ greenkeeper upgrade organization 25 <your-org-name>',
      '    For $90/month, fastest queue,  50 repos: $ greenkeeper upgrade organization 50 <your-org-name>',
      '\nIf you need more repos, emails us at support@greenkeeper.io'
    ].join('\n'))
    process.exit(1)
  }

  log.verbose('upgrade', 'starting command')

  if (!flags.token && !flags.force) {
    log.error('upgrade', 'Please log in first.')
    process.exit(1)
  }

  var id = randomString({length: 32})

  const argv = flags.argv
  if (!argv.remain || !argv.remain[0]) {
    return usage()
  }

  var url = flags.api + 'payment'

  switch (argv.remain[0]) {
    case 'supporter':
      url += '/supporter'
      break
    case 'personal':
      url += '/personal'
      break
    case 'organization':
      // require 25 or 50 option
      if (typeof argv.remain[1] === 'undefined' || ['25', '50'].indexOf(argv.remain[1]) === -1) {
        log.error('Please specify an organization plan')
        return usage()
      }
      if (!argv.remain[2]) {
        log.error('Please specify an organization name')
        return usage()
      }
      const numberOfRepos = argv.remain[1]
      url += '/organization-' + numberOfRepos
      break
    default:
      return usage()
  }

  url += '?' + querystring.stringify({
    access_token: flags.token,
    id: id
  })

  request({
    method: 'POST',
    json: true,
    url: flags.api + 'payment',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: id,
      organization: argv.remain[2]
    },
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('login', 'Payment failed', err.message)
      process.exit(1)
    }

    if (!(res.statusCode === 200 && data.ok)) {
      log.error('login', 'Payment failed', data.message)
      process.exit(1)
    }

    console.log('Payment Successful! Team greenkeeper says thank you! <3')
    console.log('Stephan, Christoph, Alex, Gregor, Jan & Ola')
  })

  log.verbose('upgrade', 'Opening url ' + url)
  open(url)
}
