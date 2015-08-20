var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  log.verbose('info', 'Starting command')

  if (!flags.token) {
    log.error('info', 'Please login first')
    process.exit(1)
  }

  var slug = flags.slug || require('./lib/slug')()

  if (!slug) {
    log.error('info', 'missing slug')
    process.exit(1)
  }

  log.info('info', 'Slug is:', slug)

  log.http('info', 'Sending request')
  request({
    method: 'GET',
    url: flags.api + 'packages/' + slug,
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (data) {
      return console.log(data)
    }

    log.error('info', err || res)
    process.exit(1)
  })
}
