const nock = require('nock')
const simple = require('simple-mock')
const { test } = require('tap')

test('parse github host', async t => {
  nock('https://enterprise.github')
    .get('/api/v3/repos/greenkeeperio/greenkeeper')
    .reply(200, {})

  simple.mock(process.env, 'GITHUB_HOST', 'https://enterprise.github/api/v3/')

  const Github = require('../../lib/github')
  const github = Github()

  try {
    await github.repos.get({owner: 'greenkeeperio', repo: 'greenkeeper'})
  } catch (error) {
    t.error(error)
  }

  simple.restore()
  t.end()
})
