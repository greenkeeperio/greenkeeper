var url = require('url')

var _ = require('lodash')
var inquirer = require('inquirer')
var log = require('npmlog')
var RegistryClient = require('npm-registry-client')
var validator = require('validator')

var client = new RegistryClient({log: log})

var cache = {}

module.exports = function self (cb) {
  startDialog(function (nope, answers) {
    getToken(answers, function (err, token) {
      if (err) {
        log.error('npm-access', 'Login failed, please try again.')
        log.error('npm-access', err.message)
        return self(cb)
      }
      cb(null, token)
    })
  })
}

function getToken (answers, cb) {
  var registry = 'https://registry.npmjs.org/'
  var username = answers.username
  var password = answers.password

  // Manual request to avoid account creation.
  // This should be supported by npm-registry-client: https://github.com/npm/npm-registry-client/issues/135

  var userobj = {
    _id: 'org.couchdb.user:' + username,
    name: username,
    password: password,
    type: 'user',
    roles: [],
    date: new Date().toISOString()
  }

  var uri = url.resolve(registry, '-/user/org.couchdb.user:' + encodeURIComponent(username))
  var options = {
    method: 'PUT',
    body: userobj
  }
  client.request(uri, options, function (error, data, json, response) {
    if (error) {
      if (error.statusCode === 401) error.message = 'Your password seems to be wrong.'
      if (error.statusCode === 400) error.message = 'You probably mistyped your username'
      return cb(error)
    }
    if (!data.token) return cb(new Error('No token returned.'))

    cb(null, data.token)
  })
}

function startDialog (cb) {
  inquirer.prompt([{
    type: 'input',
    name: 'username',
    message: 'npm username',
    default: cache.username,
    validate: _.ary(_.partial(validator.isLength, _, 1), 1)
  }, {
    type: 'password',
    name: 'password',
    message: 'npm password',
    validate: _.ary(_.partial(validator.isLength, _, 1), 1)
  }], function (answers) {
    cache = answers

    cb(null, answers)
  })
}
