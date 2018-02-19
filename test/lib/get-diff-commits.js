const nock = require('nock')

const getDiffCommits = require('../../lib/get-diff-commits')

test('get-diff-commits', async () => {
  expect.assertions(4)

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/finnp/test/compare/dead...beef')
    .reply(200, () => {
      // GitHub endpoint called
      expect(true).toBeTruthy()
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
      expect(text).toMatch(/abccommitmessage/)
      // t.ok(_.includes(text, `abccommitmessage`), 'includes commit message')
      return true
    })
    .reply(200, 'body <a href="https://github.com/greenkeeperio/greenkeeper">', {
      'content-type': 'text/html;charset=utf-8'
    })

  const diff = await getDiffCommits({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    base: 'dead',
    head: 'beef'
  })
  expect(diff).toMatch(/<summary>Commits<\/summary>/)
  expect(diff).toMatch(/https:\/\/urls.greenkeeper.io/)
  // t.ok(_.includes(diff, `<summary>Commits</summary>`), 'commits summary')
  // t.ok(
  //   _.includes(diff, `https://urls.greenkeeper.io/`),
  //   'github link was replaced'
  // )
})
