var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').whoami

module.exports = function (flags) {
  log.verbose('whoami', 'starting command')

  if (!flags.token) {
    log.error('whoami', 'Login required. Run $ greenkeeper login')
    process.exit(1)
  }

  log.http('whoami', 'Sending request')
  request({
    url: flags.api + 'whoami',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (err) {
      log.error('whoami', err.message)
      process.exit(2)
    }

    if (data.name) return console.log(story.name(data))

    log.error('whoami', res.statusMessage + (res.body.message ? ': ' + res.body.message : ''))
    process.exit(2)
  })
}
