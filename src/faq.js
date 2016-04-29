var log = require('npmlog')
var open = require('opener')

module.exports = function (flags) {
  log.verbose('faq', 'starting command')
  log.info('faq', 'Opening FAQ website')

  open('https://greenkeeper.io/faq.html')
}
