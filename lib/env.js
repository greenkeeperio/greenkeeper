const envalid = require('envalid')
const parseURL = require('url').parse
const { bool, str, url, num } = envalid

if (process.env.GITHUB_HOST) {
  try {
    const parsed = parseURL(process.env.GITHUB_HOST)
    process.env.GITHUB_URL = `${parsed.protocol}//${parsed.host}`
  } catch (e) {
    // fallback to default
  }
}

module.exports = envalid.cleanEnv(process.env, {
  PORT: num({ default: 5000 }),
  COUCH_URL: url({ devDefault: 'http://localhost:5984/' }),
  ISSUER_ID: str({ devDefault: '504', default: '505' }),
  PRIVATE_KEY: str({ devDefault: 'so-secret' }),
  AMQP_URL: url({ devDefault: 'amqp://localhost' }),
  EVENTS_QUEUE_NAME: str({ devDefault: 'events-dev' }),
  JOBS_QUEUE_NAME: str({ devDefault: 'jobs-dev' }),
  WORKER_SIZE: num({ default: require('os').cpus().length }),
  NODE_ENV: str({
    choices: ['testing', 'development', 'staging', 'production'],
    devDefault: 'development'
  }),
  ROLLBAR_TOKEN_JOBS: str({ devDefault: '' }),
  STATSD_HOST: str({ default: '172.17.0.1' }),
  NPM_REGISTRY: url({ default: 'https://registry.npmjs.org/' }),
  GITHUB_URL: url({ default: 'https://github.com' }),
  BADGES_SECRET: str({ devDefault: 'badges-secret' }),
  NPMHOOKS_SECRET: str({ devDefault: 'make-secrets-great-again' }),
  STRIPE_SECRET_KEY: str({ devDefault: 'stripe-token' }),
  IS_ENTERPRISE: bool({ default: false }),
  EMAIL_USER: str({ devDefault: 'email@dev.com' }),
  EMAIL_PASSWORD: str({ devDefault: 'emailpassword' })
})
