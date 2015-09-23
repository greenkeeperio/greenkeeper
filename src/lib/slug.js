var fs = require('fs')
var path = require('path')
var url = require('url')

var githubUrl = require('github-url-from-git')

module.exports = function (cb) {
  var pkg

  try {
    pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')))
  } catch (err) {
    return undefined
  }

  var repo = pkg.repository || ''
  repo = repo.url || repo

  var ghUrl = githubUrl(repo)

  if (ghUrl) {
    return (url.parse(ghUrl).pathname || '').substr(1)
  }
}
