var _ = require('lodash')
var chalk = require('chalk')
var log = require('npmlog')
var open = require('opener')
var request = require('request')
var querystring = require('querystring')
var randomString = require('random-string')

var getToken = require('./lib/get-token')
var checkEnterprise = require('./lib/check-enterprise')
var rc = require('@greenkeeper/flags')._rc

module.exports = checkEnterprise(function (err, flags, isEnterprise) {
  log.verbose('upgrade', 'starting command')

  if (err) {
    log.error('logout', err.message)
    process.exit(2)
  }

  if (isEnterprise) {
    log.info('upgrade', 'You are already subscribed to Greenkeeper Enterprise.')
    process.exit(0)
  }

  if (!flags.token) {
    log.error('upgrade', 'Please log in first.')
    process.exit(1)
  }

  var loginId = randomString({length: 32})
  var id = randomString({length: 32})

  var argv = flags.argv

  if (!argv.remain) {
    return usage()
  }

  var plan = argv.remain.shift()

  if (!_.includes(['supporter', 'personal', 'organization'], plan)) {
    log.error('Please specify a plan')
    return usage()
  }

  var planType = argv.remain.shift()
  var org = argv.remain.shift()

  if (plan === 'organization') {
    // require 25 or 50 option
    if (!_.includes(['25', '50'], planType)) {
      log.error('Please specify an organization plan type (25/50)')
      return usage()
    }

    plan += '-' + planType

    if (!org) {
      log.error('Please specify an organization name')
      return usage()
    }
  }

  getToken(flags, loginId, function (data) {
    rc.set('token', data.token)

    var url = flags.api + 'payment' + '/' + plan

    url += '?' + querystring.stringify({
      access_token: data.token,
      id: id
    })

    getPayment(flags, id, data.token, org, function () {
      console.log('Payment Successful! Team greenkeeper says thank you! <3')
      console.log('Stephan, Christoph, Alex, Gregor, Jan & Ola')
    })

    log.verbose('upgrade', 'Opening url ' + url)
    setTimeout(open, 1000, url)
  })

  var url = flags.api + 'login?id=' + loginId + '&private=true'

  log.verbose('upgrade', 'Opening url ' + url)
  open(url)
})

function getPayment (flags, id, token, org, callback) {
  request({
    method: 'POST',
    json: true,
    url: flags.api + 'payment',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: id,
      organization: org
    },
    headers: {
      Authorization: 'Bearer ' + token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('login', 'Payment failed', err.message)
      process.exit(2)
    }

    if (res.statusCode >= 502 && res.statusCode <= 504) {
      log.verbose('upgrade', 'Oops, that took too long. retrying...')
      return setTimeout(getPayment.bind(null, flags, id, token, org, callback), 1000)
    }

    if (!(res.statusCode === 200 && data.ok)) {
      log.error('login', 'Payment failed')
      process.exit(1)
    }

    callback(data)
  })
}

function usage () {
  console.log([
    '',
    '  Please use one of these commands:',
    '',
    '      For  $5/month, fast queue, public repositories: ' + chalk.yellow('greenkeeper upgrade supporter'),
    '      For $14/month, faster queue,  all repositories: ' + chalk.yellow('greenkeeper upgrade personal'),
    '      For $50/month, fastest queue,  25 repositories: ' + chalk.yellow('greenkeeper upgrade organization 25 <your-org-name>'),
    '      For $90/month, fastest queue,  50 repositories: ' + chalk.yellow('greenkeeper upgrade organization 50 <your-org-name>'),
    '',
    '  If you need more repositories, emails us at support@greenkeeper.io',
    '',
    '  Try risk-free: If you’re not satisfied and cancel your account within',
    '  the first 30 days, we can refund your money – no questions asked. After',
    '  that, you can always cancel to the end of each running month.',
    '',
    '  If you would like to talk to a human, type `greenkeeper support`',
    ''
  ].join('\n'))
  process.exit(1)
}
