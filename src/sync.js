var _ = require('lodash')
var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  log.verbose('sync', 'starting command')

  if (!flags.token) process.exit(0)

  log.http('sync', 'Sending request')
  request({
    method: 'POST',
    url: flags.api + 'sync',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    }
  }, function (err, res, data) {
    if (data.repos) {
      return data.repos.forEach(_.ary(console.log, 1))
    }

    log.error('sync', err || res)
  })
}
