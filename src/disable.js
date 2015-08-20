var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  log.verbose('disable', 'Starting command')

  if (!flags.token) {
    log.error('disable', 'Please login first')
    process.exit(1)
  }

  var slug = flags.slug || require('./lib/slug')()

  if (!slug) {
    log.error('disable', 'missing slug')
    process.exit(1)
  }

  log.info('disable', 'Slug is:', slug)

  log.http('disable', 'Sending request')
  request({
    method: 'DELETE',
    url: flags.api + 'packages',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    },
    body: {slug: slug}
  }, function (err, res, data) {
    if (data.ok) {
      return console.log(slug + ' disabled')
    }

    log.error('sync', err || res)
    process.exit(1)
  })
}
