var log = require('npmlog')
var request = require('request')

var story = require('./lib/story').whoami

module.exports = function (flags) {
  log.verbose('whoami', 'starting command')

  if (!flags.token) process.exit(0)

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
      process.exit(1)
    }

    if (data.name) return console.log(story.name(data))

    log.error('whoami', res.statusMessage)
    process.exit(1)
  })
}
