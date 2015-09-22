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

  log.info('enable', 'The GitHub slug is:', slug)

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
    console.log('data: ',data);
    console.log('err: ',err);
    if (!data) {
      return console.log(story.error_no_data)
    }

    if (data.noChange) {
      return console.log(story.error_no_change(slug)) // TODO: We might not need this
    }

    if (data.ok) {
      return console.log(story.enabled)
    }

    if(data.statusCode === 400){
      log.error('enable', 'A repo with this slug doesn\'t exist on GitHub')
    } else if(data.statusCode === 403){
      log.error('enable', 'You need a paid greenkeeper.io subscription to enable private repositories. You can subscribe via $ greenkeeper upgrade')
    } else {
      log.error('enable', err || res)
    }
    process.exit(1)
  })
}
