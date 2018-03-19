const diff = require('../../lib/diff-greenkeeper-json')

const oldFile = {
  groups: {
    frontend: {
      packages: [
        'packages/frontend/package.json',
        'packages/lalalalala/package.json'
      ]
    },
    backend: {
      packages: [
        'packages/backend/package.json'
      ]
    }
  }
}

test('no change', () => {
  const newFile = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json',
          'packages/lalalalala/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }
  const expected = {
    removed: [],
    added: [],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('removed a group', () => {
  const newFile = {
    groups: {
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }

  const expected = {
    removed: ['frontend'],
    added: [],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('removed 2 groups', () => {
  const newFile = {
    groups: {
      soup: {
        packages: [
          'packages/soup/package.json'
        ]
      }
    }
  }

  const expected = {
    removed: ['frontend', 'backend'],
    added: ['soup'],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('added a group', () => {
  const newFile = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json',
          'packages/lalalalala/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      },
      pizza: {
        packages: [
          'packages/pizza/package.json'
        ]
      }
    }
  }
  const expected = {
    added: ['pizza'],
    removed: [],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('added a package.json to a group', () => {
  const newFile = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json',
          'packages/lalalalala/package.json',
          'packages/pizza/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }
  const expected = {
    modified: ['frontend'],
    added: [],
    removed: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('added and removed a package.json to a group', () => {
  const newFile = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json',
          'packages/pizza/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }
  const expected = {
    modified: ['frontend'],
    added: [],
    removed: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('added a group and moved a package.json to another group', () => {
  const newFile = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json'
        ]
      },
      mobile: {
        packages: [
          'packages/mobile/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json',
          'packages/lalalalala/package.json'
        ]
      }
    }
  }
  const expected = {
    modified: ['frontend', 'backend'],
    added: ['mobile'],
    removed: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('renamed a group', () => {
  const newFile = {
    groups: {
      pizza: {
        packages: [
          'packages/frontend/package.json',
          'packages/lalalalala/package.json'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }
  const expected = {
    added: ['pizza'],
    removed: ['frontend'],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})

test('greenkeeper.json was deleted', () => {
  const newFile = {}
  const expected = {
    added: [],
    removed: ['frontend', 'backend'],
    modified: []
  }
  expect(diff(oldFile, newFile)).toMatchObject(expected)
})
