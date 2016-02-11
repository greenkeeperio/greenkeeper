var story = require('./lib/story').start

module.exports = function (flags) {
  process.stdout.write(story())
}
