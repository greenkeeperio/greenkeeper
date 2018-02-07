const { test } = require('tap')
const getMessage = require('../../lib/get-message')

/* eslint-disable no-template-curly-in-string */

test('get default commit messages', t => {
  const commitMessages = {
    initialBadge: 'docs(readme): add Greenkeeper badge',
    initialDependencies: 'chore(package): update dependencies',
    initialBranches: 'chore(travis): whitelist greenkeeper branches',
    dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
    devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
    dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
    devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
    closes: '\n\nCloses #${number}'
  }
  const values = {
    dependency: 'foo',
    version: 'bar',
    oldVersion: 'rab',
    number: 42
  }
  const expected = {
    initialBadge: 'docs(readme): add Greenkeeper badge',
    initialDependencies: 'chore(package): update dependencies',
    initialBranches: 'chore(travis): whitelist greenkeeper branches',
    dependencyUpdate: 'fix(package): update foo to version bar',
    devDependencyUpdate: 'chore(package): update foo to version bar',
    dependencyPin: 'fix: pin foo to rab',
    devDependencyPin: 'chore: pin foo to rab',
    closes: '\n\nCloses #42'
  }

  t.plan(Object.keys(commitMessages).length)
  t.is(getMessage(commitMessages, 'initialBadge'), expected.initialBadge)
  t.is(getMessage(commitMessages, 'initialDependencies'), expected.initialDependencies)
  t.is(getMessage(commitMessages, 'initialBranches'), expected.initialBranches)
  t.is(getMessage(commitMessages, 'dependencyUpdate', values), expected.dependencyUpdate)
  t.is(getMessage(commitMessages, 'devDependencyUpdate', values), expected.devDependencyUpdate)
  t.is(getMessage(commitMessages, 'dependencyPin', values), expected.dependencyPin)
  t.is(getMessage(commitMessages, 'devDependencyPin', values), expected.devDependencyPin)
  t.is(getMessage(commitMessages, 'closes', values), expected.closes)
})

test("throws when it doesn't know a message", t => {
  const commitMessages = {
    foo: '42'
  }
  const message = "Unknown message key 'bar'"

  t.plan(1)
  t.throws(() => getMessage(commitMessages, 'bar'), message)
})
