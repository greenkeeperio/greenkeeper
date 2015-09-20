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
      return console.log(story.data(data))
    }

    log.error('info', err || res)
    process.exit(1)
  })
}
