var fs = require('fs')
var path = require('path')

var _ = require('lodash')
var chalk = require('chalk')
var emoji = require('node-emoji')
var log = require('npmlog')
var request = require('request')

module.exports = function (flags) {
  var pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')))
  } catch (e) {
    log.error('npm-verify', 'No package.json in this project')
    process.exit(1)
  }

  var dependencies = Object.keys(_.assign(
    {},
    pkg.dependencies,
    pkg.devDependencies,
    pkg.optionalDependencies
  ))

  var scoped = dependencies.filter(function (dependency) {
    return dependency[0] === '@'
  })

  if (scoped.length === 0) {
    log.info('npm-verify', 'No scoped packages.')
    process.exit()
  }

  request({
    method: 'POST',
    url: flags.api + 'npm/verify',
    json: true,
    headers: {
      Authorization: 'Bearer ' + flags.token
    },
    body: {
      dependencies: scoped,
      organization: flags.organization
    }
  }, function (err, res, results) {
    if (err) {
      log.error('npm-verify', err)
      process.exit(2)
    }
    var failed = _.some(results.dependencies, ['valid', false])
    if (failed) log.info('npm-verify', 'You might need to run ' + chalk.yellow('greenkeeper npm-access'))
    results.dependencies.forEach(function (dep) {
      console.log('   ', chalk.bold(dep.name), dep.valid
        ? process.platform === 'darwin' ? emoji.get('white_check_mark') : chalk.green('accessible')
        : process.platform === 'darwin' ? emoji.get('x') : chalk.red('inaccessible')
      )
    })
    process.exit()
  })
}
