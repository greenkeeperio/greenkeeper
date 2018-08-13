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
      lockfileUpdate: 'chore(package): update lockfile',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    prTitles: {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for ${group} 🌴',
      basicPR: 'Update ${dependency} to the latest version 🚀',
      groupPR: 'Update ${dependency} in group ${group} to the latest version 🚀'
    }
  }
  expect(getConfig(repository)).toEqual(expected)
})

test('get config from root greenkeeper section', () => {
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
      lockfileUpdate: 'chore(package): update lockfile',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    prTitles: {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for ${group} 🌴',
      basicPR: 'Update ${dependency} to the latest version 🚀',
      groupPR: 'Update ${dependency} in group ${group} to the latest version 🚀'
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
      lockfileUpdate: 'chore(package): update lockfile',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    prTitles: {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for ${group} 🌴',
      basicPR: 'Update ${dependency} to the latest version 🚀',
      groupPR: 'Update ${dependency} in group ${group} to the latest version 🚀'
    }
  }
  expect(getConfig(repository)).toEqual(expected)
})

test('get custom pr title', () => {
  expect.assertions(1)

  const repository = {
    packages: {
      'package.json': {
        greenkeeper: {
          commitMessages: {
            initialBadge: 'HELLO Greenkeeper badge'
          },
          prTitles: {
            basicPR: 'update Jacoba to the latest version',
            groupPR: 'update group of Jacoba to the latest version'
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
      lockfileUpdate: 'chore(package): update lockfile',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    prTitles: {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for ${group} 🌴',
      basicPR: 'update Jacoba to the latest version',
      groupPR: 'update group of Jacoba to the latest version'
    }
  }
  expect(getConfig(repository)).toEqual(expected)
})

test('get ignore config with empty greenkeeper config', () => {
  expect.assertions(1)

  const repository = {
    _id: '51',
    accountId: '123',
    fullName: 'treasure-data/td-js-sdk',
    packages: {
      'package.json': {
        greenkeeper: {
          ignore: ['domready', 'karma', 'mocha']
        },
        'devDependencies': {
          'expect.js': '^0.3.1',
          'express': '^4.14.0',
          'glob': '^7.0.5',
          'js-polyfills': '^0.1.34',
          'karma': '1.3.0',
          'karma-browserstack-launcher': '^1.3.0',
          'karma-chrome-launcher': '^2.2.0',
          'karma-firefox-launcher': '^1.0.1',
          'karma-min-reporter': '^0.1.0',
          'karma-mocha': '^1.3.0',
          'karma-safari-launcher': '^1.0.0',
          'karma-webpack': '^2.0.4',
          'mocha': '^2.5.3',
          'parse-domain': '^2.0.0',
          'phantomjs-prebuilt': '^2.1.7',
          'requirejs': '^2.2.0',
          'selenium-standalone': '^5.4.0',
          'simple-mock': '^0.8.0',
          'standard': '^11.0.0',
          'tape': '^4.6.0',
          'uglifyjs': '^2.4.10',
          'uglifyjs-webpack-plugin': '^0.4.6',
          'wd': '^1.5.0',
          'webpack': '^1.13.1'
        },
        'dependencies': {
          'domready': '^0.3.0',
          'global': '^4.3.0',
          'json3': '^3.3.2',
          'jsonp': '0.2.1',
          'lodash-compat': '^3.10.1'
        }
      }
    },
    greenkeeper: {}
  }

  const expected = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: ['domready', 'karma', 'mocha'],
    commitMessages: {
      addConfigFile: 'chore: add Greenkeeper config file',
      updateConfigFile: 'chore: update Greenkeeper config file',
      initialBadge: 'docs(readme): add Greenkeeper badge',
      initialDependencies: 'chore(package): update dependencies',
      initialBranches: 'chore(travis): whitelist greenkeeper branches',
      dependencyUpdate: 'fix(package): update ${dependency} to version ${version}',
      devDependencyUpdate: 'chore(package): update ${dependency} to version ${version}',
      lockfileUpdate: 'chore(package): update lockfile',
      dependencyPin: 'fix: pin ${dependency} to ${oldVersion}',
      devDependencyPin: 'chore: pin ${dependency} to ${oldVersion}',
      closes: '\n\nCloses #${number}'
    },
    prTitles: {
      initialPR: 'Update dependencies to enable Greenkeeper 🌴',
      initialPrBadge: 'Add badge to enable Greenkeeper 🌴',
      initialPrBadgeOnly: 'Add Greenkeeper badge 🌴',
      initialSubgroupPR: 'Update dependencies for ${group} 🌴',
      basicPR: 'Update ${dependency} to the latest version 🚀',
      groupPR: 'Update ${dependency} in group ${group} to the latest version 🚀'
    }
  }

  expect(getConfig(repository)).toMatchObject(expected)
})
/* eslint-enable no-template-curly-in-string */
