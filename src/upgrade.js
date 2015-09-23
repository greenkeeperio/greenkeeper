module.exports = function (flags) {
  console.log('Plans for private repos/support will follow later this month')
  return;

  var log = require('npmlog')
  var open = require('open')
  var request = require('request')

  function usage () {
    log.error('Please use one of these commands: \n\n' + [
      'greenkeeper upgrade supporter ($5 / month, fast queue)',
      'greenkeeper upgrade personal ($14 / month, infinite repos, faster queue)',
      'greenkeeper upgrade organisation 25 ($50 / month, 25 repos, fastest queue)',
      'greenkeeper upgrade organisation 50 ($90 / month, 50 repos, fastest queue)',
      '\n# if you need more repos, emails us at hi@greenkeeper.io'
    ].join('\n'))
    process.exit(1)
  }

  log.verbose('upgrade', 'starting command')

  if (!flags.token && !flags.force) {
    log.error('upgrade', 'Please log in first.')
    process.exit(1)
  }

  const argv = flags.argv
  if (!argv.remain || !argv.remain[0]) {
    return usage()
  }

  var url = flags.api + '/upgrade'
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
    url: flags.api + 'upgrade/wait',
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

  log.verbose('upgrade', 'Opening url ' + url)
  open(url)
}
