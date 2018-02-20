const { test } = require('tap')
const getConfig = require('../../lib/get-config')

/* eslint-disable no-template-curly-in-string */

test('get default config', t => {
  t.plan(1)

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

  t.same(getConfig(repository), expected)
})

test('get custom commit message', t => {
  t.plan(1)

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

  t.same(getConfig(repository), expected)
})
/* eslint-enable no-template-curly-in-string */
