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
    if(err){
      log.error('info', err)
    }
    if (data.error){
      // TODO: Not sure which format error messages might be in yet
      log.error('info', data.error)
    }
    if (data) {
      if(data.disabled){
        log.info('info', 'greenkeeper isn\'t enabled for this repo')
      } else {
        log.info('info', 'greenkeeper is enabled for this repo')
      }
    }
    process.exit(1)
  })
}
