var test = require('tap').test

var story = require('../src/lib/story')

test('readme', function (t) {
  t.matches(story.usage(), /check the faq/i)
  t.end()
})
