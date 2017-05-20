const { test } = require('tap')

test('parse github host', t => {
  process.env.GITHUB_HOST = 'https://enterprise.github/api/v3/'
  const Github = require('../../lib/github')
  const github = Github()
  t.is(github.config.protocol, 'https')
  t.is(github.config.host, 'enterprise.github')
  t.is(github.config.pathPrefix, '/api/v3')
  t.end()
})
