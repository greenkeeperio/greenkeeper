const getMessage = require('../../lib/get-message')

/* eslint-disable no-template-curly-in-string */

test('get default commit messages', () => {
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

  expect.assertions(Object.keys(commitMessages).length)
  expect(getMessage(commitMessages, 'initialBadge')).toEqual(expected.initialBadge)
  expect(getMessage(commitMessages, 'initialDependencies')).toEqual(expected.initialDependencies)
  expect(getMessage(commitMessages, 'initialBranches')).toEqual(expected.initialBranches)
  expect(getMessage(commitMessages, 'dependencyUpdate', values)).toEqual(expected.dependencyUpdate)
  expect(getMessage(commitMessages, 'devDependencyUpdate', values)).toEqual(expected.devDependencyUpdate)
  expect(getMessage(commitMessages, 'dependencyPin', values)).toEqual(expected.dependencyPin)
  expect(getMessage(commitMessages, 'devDependencyPin', values)).toEqual(expected.devDependencyPin)
  expect(getMessage(commitMessages, 'closes', values)).toEqual(expected.closes)
})

test("throws when it doesn't know a message", () => {
  const commitMessages = {
    foo: '42'
  }
  const message = "Unknown message messageKey 'bar'"

  expect.assertions(1)
  expect(() => {
    getMessage(commitMessages, 'bar')
  }).toThrowError(message)
})

test('ignores invalid variables and replaces the commit message with the default one', () => {
  const commitMessages = {
    dependencyUpdate: 'fix(package): update ${console.log("hallo")} to version ${lalala}',
    closes: '\n\nCloses #${111111}'
  }
  const values = {
    dependency: 'foo',
    version: 'bar',
    oldVersion: 'rab',
    number: 42
  }
  const expected = {
    dependencyUpdate: 'fix(package): update foo to version bar',
    closes: '\n\nCloses #42'
  }

  expect.assertions(Object.keys(commitMessages).length)
  expect(getMessage(commitMessages, 'closes', values)).toEqual(expected.closes)
  expect(getMessage(commitMessages, 'dependencyUpdate', values)).toEqual(expected.dependencyUpdate)
})
