const { getBranchesToDelete } = require('../../lib/branches-to-delete')

test('no change', () => {
  const changes = {}

  expect(getBranchesToDelete(changes)).toEqual([])
})

test('modified', () => {
  const changes = {
    dependencies: {
      lodash: {
        change: 'modified',
        before: '^1.0.0',
        after: '^2.0.0'
      }
    }
  }

  expect(getBranchesToDelete(changes)).toEqual([
    {
      'after': '^2.0.0',
      'before': '^1.0.0',
      'change': 'modified',
      'dependency': 'lodash',
      'dependencyType': 'dependencies'
    }
  ])
})
