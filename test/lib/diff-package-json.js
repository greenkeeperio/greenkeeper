const { test } = require('tap')

const diff = require('../../lib/diff-package-json')

test('no change', t => {
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
  t.same(diff(a, b), {})
  t.end()
})

test('update dependency', t => {
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
  t.same(diff(a, b), {
    dependencies: {
      lodash: {
        change: 'modified',
        before: '^1.0.0',
        after: '^2.0.0'
      }
    }
  })
  t.end()
})

test('add dependency', t => {
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
  t.same(diff(a, b), {
    dependencies: {
      async: {
        change: 'added',
        before: undefined,
        after: '^1.0.0'
      }
    }
  })
  t.end()
})

test('remove dependency', t => {
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
  t.same(diff(a, b), {
    dependencies: {
      async: {
        change: 'removed',
        before: '^1.0.0',
        after: undefined
      }
    }
  })
  t.end()
})
