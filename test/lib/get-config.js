const getConfig = require('../../lib/get-config')

/* eslint-disable no-template-curly-in-string */

test('get default config', () => {
  expect.assertions(1)

  const repository = {
    packages: {
      'package.json': {}
    }
  }

  const expected = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    commitMessages: {
      addConfigFile: 'chore: add Greenkeeper config file',
      updateConfigFile: 'chore: update Greenkeeper config file',
      initialBadge: 'docs(readme): add Greenkeeper badge',
      initialDependencies: 'chore(package): update dependencies',
      initialBranches: 'chore(travis): whitelist greenkeeper branches',
      dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
      devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    }
  }
  expect(getConfig(repository)).toEqual(expected)
})

test('get config from  root greenkeeper section', () => {
  expect.assertions(1)

  const repository = {
    packages: {
      'package.json': {}
    },
    greenkeeper: {
      groups: {
        backend: {
          ignore: [
            'lodash'
          ],
          packages: [
            'apps/backend/hapiserver/package.json'
          ]
        }
      }
    }
  }

  const expected = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    commitMessages: {
      addConfigFile: 'chore: add Greenkeeper config file',
      updateConfigFile: 'chore: update Greenkeeper config file',
      initialBadge: 'docs(readme): add Greenkeeper badge',
      initialDependencies: 'chore(package): update dependencies',
      initialBranches: 'chore(travis): whitelist greenkeeper branches',
      dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
      devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    groups: {
      backend: {
        ignore: ['lodash'],
        packages: ['apps/backend/hapiserver/package.json']
      }
    }
  }

  expect(getConfig(repository)).toMatchObject(expected)
})

test('get custom commit message', () => {
  expect.assertions(1)

  const repository = {
    packages: {
      'package.json': {
        greenkeeper: {
          commitMessages: {
            initialBadge: 'HELLO Greenkeeper badge'
          }
        }
      }
    }
  }

  const expected = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    commitMessages: {
      addConfigFile: 'chore: add Greenkeeper config file',
      updateConfigFile: 'chore: update Greenkeeper config file',
      initialBadge: 'HELLO Greenkeeper badge',
      initialDependencies: 'chore(package): update dependencies',
      initialBranches: 'chore(travis): whitelist greenkeeper branches',
      dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
      devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    }
  }
  expect(getConfig(repository)).toEqual(expected)
})
/* eslint-enable no-template-curly-in-string */
