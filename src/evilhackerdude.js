var open = require('opener')

module.exports = function (flags) {
  console.log('We have content addressed you!')
  open('https://www.youtube.com/watch?v=TrcT7sseLZI')
}
