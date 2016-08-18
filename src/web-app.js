var open = require('opener')
var rc = require('@greenkeeper/flags')._rc

module.exports = function (flags) {
  var url = 'https://app.greenkeeper.io'
  open(url, function (err) {
    if (err) return console.log('Open this URL:', url)
    rc.set('web_interface_beta_banner', 11)
  })
}
