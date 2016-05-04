var exec = require('child_process').exec
var fs = require('fs')
var path = require('path')

var jsonPreserveIndent = require('json-preserve-indent')
var log = require('npmlog')
var spinner = require('char-spinner')

module.exports = function (flags) {
  var pkgPath = path.join(process.cwd(), 'package.json')
  var pkgFile = fs.readFileSync(pkgPath)
  var pkg
  try {
    pkg = jsonPreserveIndent(pkgFile)
  } catch (e) {
    log.error('postpublish', 'Could not parse package.json')
    process.exit(1)
  }

  if (pkg.get('name[0]') !== '@') log.warn('postpublish', 'This is not a scoped package. "greenkeeper-postpublish" should not be required.')

  if (pkg.get('devDependencies.greenkeeper-postpublish')) {
    log.info('postpublish', 'greenkeeper-postpublish is already installed')
    process.exit()
  }

  if (pkg.get('scripts.postpublish')) {
    log.error('postpublish', 'There is already a postpublish script present', '"postpublish": "' + pkg.scripts.postpublish + '"')
    process.exit(1)
  }

  pkg.set('scripts.postpublish', 'greenkeeper-postpublish')

  fs.writeFileSync(pkgPath, pkg.format())

  log.verbose('postpublish', 'Updated the package.json')

  log.info('postpublish', 'Installing greenkeeper-postpublish')
  var spin = spinner()
  exec('npm install greenkeeper-postpublish --save-dev', function (err, stdout, stderr) {
    clearInterval(spin)
    if (err) {
      log.error('postpublish', 'Failed to install greenkeeper-postpublish', err)
      process.exit(1)
    }
    log.info('postpublish', 'greenkeeper-postpublish installed and added as devDependency')
  })
}
