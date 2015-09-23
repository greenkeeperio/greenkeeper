var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').info

module.exports = function (flags) {
  log.verbose('info', 'Starting command')

  if (!flags.token) {
    log.error('info', story.error_login_first)
    process.exit(1)
  }

  var slug = flags.slug || require('./lib/slug')()

  if (!slug) {
    log.error('info', story.error_missing_slug)
    process.exit(1)
  }

  log.info('info', 'The GitHub slug is:', slug)

  log.http('info', 'Sending request')
  request({
    method: 'GET',
    url: flags.api + 'packages/' + slug,
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('info', err.message)
      process.exit(1)
    }

    if (data.beta) {
      log.warn('queue', 'We aren\'t sending pull requests for this repo yet, because we haven\'t activated your account.')
      log.warn('queue', 'We will let you know when that happens – and it won\'t take long :)')
    }

    if (data.disabled) {
      log.error('info', 'greenkeeper isn’t enabled for this repo')
      process.exit(1)
    }

    if (data.statusCode === 409) {
      log.error('info', 'Conflict! We appear to have this repo in our system several times\nThis can happen if you have moved or recreated the repo\nWe can fix this though, please contact us at $ greenkeeper support')
      process.exit(1)
    }

    if (data.error) {
      log.error('info', data.error)
      process.exit(1)
    }

    console.log('greenkeeper is enabled for this repo')
  })
}
