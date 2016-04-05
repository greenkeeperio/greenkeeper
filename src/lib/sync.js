var spinner = require('char-spinner')
var request = require('request')

module.exports = function (opts, callback) {
  var spin = spinner()
  request({
    method: 'POST',
    url: opts.api + 'sync',
    json: true,
    headers: {
      Authorization: 'Bearer ' + opts.token
    }
  }, function (err, res, data) {
    clearInterval(spin)
    if (err) return callback(err)

    if (!data.repos) {
      var errorMessage = res.statusMessage
      if (res.body.message) errorMessage += ': ' + res.body.message
      return callback(new Error(errorMessage))
    }

    callback(null, data.repos)
  })
}
