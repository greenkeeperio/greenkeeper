var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  log.verbose('enable', 'Starting command')

  if (!flags.token) {
    log.error('enable', 'Please login first')
    process.exit(1)
  }

  var slug = flags.slug || require('./lib/slug')()

  if (!slug) {
    log.error('enable', 'missing slug')
    process.exit(1)
  }

  log.info('enable', 'Slug is:', slug)

  log.http('enable', 'Sending request')
  request({
    method: 'POST',
    url: flags.api + 'packages',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    },
    body: {slug: slug}
  }, function (err, res, data) {
    if (data.ok) {
      return console.log(slug + ' enabled')
    }

    log.error('enable', err || res)
    process.exit(1)
  })
}
