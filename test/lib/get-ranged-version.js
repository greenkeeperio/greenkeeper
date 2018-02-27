const { extractPrefix } = require('../../lib/get-ranged-version')
const _ = require('lodash')

test('get ranged version', () => {
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

  expect.assertions(Object.keys(assertions))
  _.each(assertions, (prefix, range) => expect(extractPrefix(range)).toEqual(prefix))
})
