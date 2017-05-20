const _ = require('lodash')
const { test } = require('tap')

const { extractPrefix } = require('../../lib/get-ranged-version')

test('get ranged version', t => {
  const assertions = {
    latest: '^',
    next: '^',
    'no-semver': '',
    '1.0.0': '',
    '~1.0.0': '~',
    '^1.0.0': '^',
    '>1.0.0': '>=',
    '>=1.0.0': '>=',
    '*': '>=',
    '1.x.x': '^',
    '1.*.*': '^',
    '1.X.*': '^',
    '20.0.*': '~',
    '1.0.x': '~',
    '<1.0.0': '',
    'x.X.x': '>=',
    '*.*.*': '>=',
    'x.X.*': '>=',
    x: '>=',
    'x.*': '>=',
    '*.*': '>=',
    '1.x': '^',
    '1': '^',
    '1.0': '~',
    '': '>='
  }

  t.plan(Object.keys(assertions).length)
  _.each(assertions, (prefix, range) => t.is(extractPrefix(range), prefix))
})
