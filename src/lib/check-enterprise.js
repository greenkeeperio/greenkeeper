var request = require('request')

module.exports = function (callback) {
  return function (flags) {
    if (flags.api === 'https://api.greenkeeper.io/') return callback(null, flags, false)
    request({
      method: 'GET',
      json: true,
      url: flags.api
    }, function (err, res, data) {
      if (err) return callback(err, flags)
      if (res.statusCode !== 200) return callback(new Error(res.statusCode), flags)
      callback(null, flags, data.environment === 'enterprise')
    })
  }
}
