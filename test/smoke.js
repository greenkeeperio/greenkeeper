var test = require('tap').test

var greenkeeper = require('../')

test('smoke', function (t) {
  t.ok(greenkeeper)
  t.end()
})
