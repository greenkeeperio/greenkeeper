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
})
