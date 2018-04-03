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

test('valid without groups', () => {
  const file = {
    ignore: [
      'totally-terrible-dependency'
    ]
  }
  const result = validate(file)
  expect(result.error).toBeFalsy()
})

test('invalid: groupname has invalid characters', () => {
  const file = {
    groups: {
      'front!end': {
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
  expect(result.error.details[0].message).toMatch(/"front!end" is not allowed/)
  expect(result.error.details[0].formattedMessage).toMatch('The group name `front!end` is invalid. Group names may only contain alphanumeric characters, underscores, dashes and the @ symbol (a-zA-Z_@-).')
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
  expect(result.error.details[0].formattedMessage).toMatch('The package path `/packages/frontend/package.json` in the group `frontend` must be relative and not start with a slash.')
})

test('invalid: absolute root path is not allowed', () => {
  const file = {
    groups: {
      frontend: {
        packages: [
          '/package.json'
        ]
      }
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].path).toEqual([ 'groups', 'frontend', 'packages', 0 ])
  expect(result.error.details[0].context.value).toEqual('/package.json')
  expect(result.error.details[0].message).toMatch(/fails to match the required pattern/)
  expect(result.error.details[0].formattedMessage).toMatch('The package path `/package.json` in the group `frontend` must be relative and not start with a slash.')
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
  expect(result.error.details[0].formattedMessage).toMatch('The package path `packages/frontend/` in the group `frontend` must end with `package.json`.')
})

test('invalid: group/s not under group key', () => {
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
  expect(result.error.details.length).toEqual(2)
  expect(result.error.details[0].message).toMatch(/"frontend" is not allowed/)
  expect(result.error.details[0].formattedMessage).toMatch('The root-level key `frontend` is invalid. If you meant to add a group named `frontend`, please put it in a root-level `groups` object. Valid root-level keys are `groups` and `ignore`.')
  expect(result.error.details[1].message).toMatch(/"backend" is not allowed/)
  expect(result.error.details[1].formattedMessage).toMatch('The root-level key `backend` is invalid. If you meant to add a group named `backend`, please put it in a root-level `groups` object. Valid root-level keys are `groups` and `ignore`.')
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
  expect(result.error.details[0].formattedMessage).toMatch(/The group `frontend` must contain a `packages` key./)
})

test('invalid: no packages and invalid root level key', () => {
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
    },
    badgers: {
      dangerous: true
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].message).toMatch(/"packages" is required/)
  expect(result.error.details[0].formattedMessage).toMatch(/The group `frontend` must contain a `packages` key./)
  expect(result.error.details[1].message).toMatch(/"badgers" is not allowed/)
  expect(result.error.details[1].formattedMessage).toMatch('The root-level key `badgers` is invalid. If you meant to add a group named `badgers`, please put it in a root-level `groups` object. Valid root-level keys are `groups` and `ignore`.')
})

test('invalid: catches invalid chars in otherwise valid package path', () => {
  const file = {
    groups: {
      backend: {
        packages: [
          'packages/#backend/package.json'
        ]
      }
    }
  }
  const result = validate(file)
  expect(result.error).toBeTruthy()
  expect(result.error.name).toEqual('ValidationError')
  expect(result.error.details[0].message).toMatch(/fails to match the required pattern/)
  expect(result.error.details[0].formattedMessage).toEqual('The package path `packages/#backend/package.json` in the group `backend` is invalid. It must be a relative path to a `package.json` file. The path may not start with a slash, and it must end in `package.json`.')
})
