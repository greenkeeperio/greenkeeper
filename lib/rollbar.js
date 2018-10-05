const { resolve } = require('path')

const Rollbar = require('rollbar')

const env = require('./env')
const pkg = require('../package.json')

const enabled = env.NODE_ENV !== 'development' && !env.IS_ENTERPRISE

if (enabled) {
  module.exports = new Rollbar({
    accessToken: env.ROLLBAR_TOKEN_JOBS,
    environment: env.NODE_ENV,
    code_version: `v${pkg.version}`,
    root: resolve(__dirname, '../'),
    handleUncaughtExceptions: true,
    handleUnhandledRejections: true,
    exitOnUncaughtException: true
  })
} else {
  module.exports = new Rollbar({ enabled: false })
}
