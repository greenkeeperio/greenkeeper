var log = require('npmlog')
var request = require('request')

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
    if (data.name) return console.log(data.name)

    log.error('whoami', err || res)
  })
}
