var request = require('request')
var log = require('npmlog')

var story = require('./story').login

module.exports = function getToken (flags, id, callback) {
  request({
    method: 'POST',
    json: true,
    url: flags.api + 'tokens',
    timeout: 1000 * 60 * 60, // wait 1h
    body: {
      id: id
    }
  }, function (err, res, data) {
    if (err) {
      log.error('login', story.request_failed)
      process.exit(2)
    }

    if (res.statusCode >= 502 && res.statusCode <= 504) {
      log.verbose('login', 'Oops, that took too long. retrying...')
      return setTimeout(getToken.bind(null, flags, id, callback), 1000)
    }

    if (!(res.statusCode === 200 && data.token)) {
      log.error('login', story.login_failed)
      process.exit(1)
    }

    callback(data)
  })
}
