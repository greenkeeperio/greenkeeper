var fs = require('fs')
var path = require('path')

var _ = require('lodash')
var home = require('os-homedir')

var configPath = path.join(home(), '.greenkeeperrc')

var config

try {
  config = JSON.parse(fs.readFileSync(configPath))
} catch (e) {
  config = {}
}

exports.get = function () {
  return config
}

exports.set = function (name, value) {
  config[name] = value
  exports._save()
}

exports.unset = function (name) {
  delete config[name]
  exports._save()
}

exports.replace = function (newConfig) {
  config = newConfig
  exports._save()
}

exports.merge = function (newConfig) {
  _.merge(config, newConfig)
  exports._save()
}

exports._save = function () {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}
