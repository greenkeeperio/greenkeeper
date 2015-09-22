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
    if (data) {
      if(data.disabled){
        log.info('info', 'greenkeeper isn\'t enabled for this repo')
      } else {
        log.info('info', 'greenkeeper is enabled for this repo')
      }
    }
    if(err){
      log.error('info', err)
      process.exit(1)
    }
    if (data.error){
      switch(data.statusCode){
        // TODO: Not sure which other error messages we need to cover
        case 409:
          log.error('info', 'Conflict! We appear to have this repo in our system several times. This can happen if you have moved or recreated the repo. We can fix this though, please contact us at $ greenkeeper support')
          return;
        break;
      }
      log.error('info', data.error)
      process.exit(1)
    }
  })
}
