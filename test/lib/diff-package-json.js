const diff = require('../../lib/diff-package-json')

test('no change', () => {
  const a = {
    name: 'a',
    dependencies: {
      lodash: '^1.0.0'
    }
  }
  const b = {
    name: 'b',
    dependencies: {
      lodash: '^1.0.0'
    }
  }
  expect(diff(a, b)).toEqual({})
})

test('update dependency', () => {
  const a = {
    dependencies: {
      lodash: '^1.0.0'
    }
  }
  const b = {
    dependencies: {
      lodash: '^2.0.0'
    }
  }

  const expected = {
    dependencies: {
      lodash: {
        change: 'modified',
        before: '^1.0.0',
        after: '^2.0.0'
      }
    }
  }
  expect(diff(a, b)).toMatchObject(expected)
})

test('add dependency', () => {
  const a = {
    dependencies: {
      lodash: '^1.0.0'
    }
  }
  const b = {
    dependencies: {
      lodash: '^1.0.0',
      async: '^1.0.0'
    }
  }
  const expected = {
    dependencies: {
      async: {
        change: 'added',
        before: undefined,
        after: '^1.0.0'
      }
    }
  }
  expect(diff(a, b)).toMatchObject(expected)
})

test('remove dependency', () => {
  const a = {
    dependencies: {
      lodash: '^1.0.0',
      async: '^1.0.0'
    }
  }
  const b = {
    dependencies: {
      lodash: '^1.0.0'
    }
  }
  const expected = {
    dependencies: {
      async: {
        change: 'removed',
        before: '^1.0.0',
        after: undefined
      }
    }
  }
  expect(diff(a, b)).toMatchObject(expected)
})
