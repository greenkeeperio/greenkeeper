const _ = require('lodash')
const StatsD = require('hot-shots')

const env = require('./env')
const rollbar = require('./rollbar')

module.exports = new StatsD({
  host: env.STATSD_HOST,
  prefix: 'jobs.',
  globalTags: [env.NODE_ENV],
  mock: _.includes(['development', 'testing'], env.NODE_ENV),
  errorHandler: err => rollbar.handleError(err)
})
