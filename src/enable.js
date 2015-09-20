var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').enable

module.exports = function (flags) {
  log.verbose('enable', 'Starting command')

  if (!flags.token) {
    log.error('enable', story.error_login_first)
    process.exit(1)
  }

  var slug = flags.slug || require('./lib/slug')()

  if (!slug) {
    log.error('enable', story.error_missing_slug)
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

    if (!data) {
      return console.log(story.error_no_data)
    }

    if (data.noChange) {
      return console.log(story.error_no_change(slug)) // TODO: We might not need this
    }

    if (data.ok) {
      return console.log(story.enabled)
    }

    log.error('enable', err || res)
    process.exit(1)
  })
}
