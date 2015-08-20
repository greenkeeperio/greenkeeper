var fs = require('fs')
var path = require('path')
var url = require('url')

var githubUrl = require('github-from-package')

module.exports = function (cb) {
  var pkg

  try {
    pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')))
  } catch (err) {
    return undefined
  }

  return (url.parse(githubUrl(pkg)).pathname || '').substr(1)
}
