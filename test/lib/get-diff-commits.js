const nock = require('nock')
const { test } = require('tap')
const _ = require('lodash')
const Github = require('../../lib/github')

const getDiffCommits = require('../../lib/get-diff-commits')

test('get-diff-commits', async t => {
  t.plan(4)

  nock('https://api.github.com', {
    reqheaders: {
      Authorization: 'token secret'
    }
  })
    .get('/repos/finnp/test/compare/dead...beef')
    .reply(200, () => {
      t.pass('GitHub endpoint called')
      return {
        total_commits: 1,
        behind_by: 0,
        html_url: '...',
        commits: [
          {
            sha: 'deadbeef',
            commit: {
              message: 'abccommitmessage'
            }
          }
        ]
      }
    })
    .post('/markdown', ({ text }) => {
      t.ok(_.includes(text, `abccommitmessage`), 'includes commit message')
      return true
    })
    .reply(200, 'body <a href="https://github.com/greenkeeperio/greenkeeper">')

  const github = Github()
  github.authenticate({ type: 'token', token: 'secret' })

  const diff = await getDiffCommits({
    github,
    owner: 'finnp',
    repo: 'test',
    base: 'dead',
    head: 'beef'
  })
  t.ok(_.includes(diff, `<summary>Commits</summary>`), 'commits summary')
  t.ok(
    _.includes(diff, `https://urls.greenkeeper.io/`),
    'github link was replaced'
  )
})
