const {validate} = require('../../lib/validate-greenkeeper-json')

test('valid', () => {
  const file = {
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
  const result = validate(file)
  expect(result.error).toBeFalsy()
})

test('valid with subgroup level ignore', () => {
  const file = {
    groups: {
      frontend: {
        ignore: [
          'lodash'
        ],
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
  const result = validate(file)
  expect(result.error).toBeFalsy()
})

test('invalid: groupname has invalid characters', () => {
  const file = {
    groups: {
      'front-end': {
        ignore: [
          'lodash'
        ],
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
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.details[0].message).toMatch(/"front-end" is not allowed/)
})

test('invalid: absolute paths are not allowed', () => {
  const file = {
    groups: {
      frontend: {
        packages: [
          '/packages/frontend/package.json'
        ]
      }
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].path).toEqual([ 'groups', 'frontend', 'packages', 0 ])
  expect(result.error.details[0].context.value).toEqual('/packages/frontend/package.json')
  expect(result.error.details[0].message).toMatch(/fails to match the required pattern/)
})

test('invalid: path is not ending on `package.json`', () => {
  const file = {
    groups: {
      frontend: {
        packages: [
          'packages/frontend/package.json',
          'packages/frontend/'
        ]
      }
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].path).toEqual([ 'groups', 'frontend', 'packages', 1 ])
  expect(result.error.details[0].context.value).toEqual('packages/frontend/')
  expect(result.error.details[0].message).toMatch(/fails to match the required pattern/)
})

test('invalid: no group/s', () => {
  const file = {
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
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details.length).toEqual(1)
  expect(result.error.details[0].message).toMatch(/"groups" is required/)
})

test('invalid: no packages', () => {
  const file = {
    groups: {
      frontend: {
        ignore: [
          'lodash'
        ]
      },
      backend: {
        packages: [
          'packages/backend/package.json'
        ]
      }
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].message).toMatch(/"packages" is required/)
})
