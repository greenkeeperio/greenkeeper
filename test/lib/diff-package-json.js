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
  // t.same(diff(a, b), {})
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
  // t.same(diff(a, b), )
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
  // t.same(diff(a, b), {
  //   dependencies: {
  //     async: {
  //       change: 'added',
  //       before: undefined,
  //       after: '^1.0.0'
  //     }
  //   }
  // })
  // t.end()
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
  // t.same(diff(a, b), {
  //   dependencies: {
  //     async: {
  //       change: 'removed',
  //       before: '^1.0.0',
  //       after: undefined
  //     }
  //   }
  // })
  // t.end()
})
