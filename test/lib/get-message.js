const {getMessage, getPrTitle} = require('../../lib/get-message')
const {defaultPrTitles} = require('../../lib/default-pr-titles')

/* eslint-disable no-template-curly-in-string */

describe('custom commit messages', () => {
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
})

describe('custom pr titles', () => {
  const dependency = 'jacoba'
  const group = 'jacoba'

  test('get default pr titles', () => {
    const expected = {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for jacoba 🌴',
      basicPR: 'Update jacoba to the latest version 🚀',
      groupPR: 'Update jacoba in group jacoba to the latest version 🚀'
    }

    expect.assertions(6)

    expect(getPrTitle({
      version: 'initialPR',
      prTitles: defaultPrTitles})).toEqual(expected.initialPR)

    expect(getPrTitle({
      version: 'initialPrBadge',
      prTitles: defaultPrTitles})).toEqual(expected.initialPrBadge)

    expect(getPrTitle({
      version: 'initialPrBadgeOnly',
      prTitles: defaultPrTitles})).toEqual(expected.initialPrBadgeOnly)

    expect(getPrTitle({
      version: 'initialSubgroupPR',
      group,
      prTitles: defaultPrTitles})).toEqual(expected.initialSubgroupPR)

    expect(getPrTitle({
      version: 'basicPR',
      dependency,
      prTitles: defaultPrTitles})).toEqual(expected.basicPR)

    expect(getPrTitle({
      version: 'groupPR',
      dependency,
      group,
      prTitles: defaultPrTitles})).toEqual(expected.groupPR)
  })

  test("throws when it doesn't know a pr title", () => {
    const prTitles = {
      cat: '🚀🚀🚀'
    }

    expect.assertions(1)
    expect(() => {
      getPrTitle({
        version: 'basicPR',
        dependency,
        prTitles})
    }).toThrowError('exited: Unknown PR key')
  })

  test('ignores invalid variables and replaces the commit message with the default one', () => {
    const wrongPRTitles = {
      basicPR: 'update ${console.log("hallo")} to version ${lalala}',
      groupPR: 'Update ${#spaghetti} 🚀'
    }

    const expected = {
      basicPR: 'Update jacoba to the latest version 🚀',
      groupPR: 'Update jacoba in group jacoba to the latest version 🚀'
    }

    expect.assertions(2)
    expect(getPrTitle({
      version: 'basicPR',
      dependency,
      prTitles: wrongPRTitles})).toEqual(expected.basicPR)

    expect(getPrTitle({
      version: 'groupPR',
      group,
      dependency,
      prTitles: wrongPRTitles})).toEqual(expected.groupPR)
  })
})
