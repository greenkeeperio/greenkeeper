const _ = require('lodash')
const RegClient = require('npm-registry-client')

module.exports = opts => new RegClient(
  _.defaults(opts, {
    log: _([
      'error',
      'warn',
      'info',
      'verbose',
      'silly',
      'http',
      'pause',
      'resume'
    ])
      .mapKeys(k => k)
      .mapValues(() => _.noop)
      .value()
  })
)
