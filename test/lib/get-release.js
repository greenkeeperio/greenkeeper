const nock = require('nock')

const getRelease = require('../../lib/get-release')

test('get-release from tag with v prefix', async () => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">',
      name: 'v1.33.7'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7'
  })
  expect(notes).toMatch(/<summary>Release Notes for v1.33.7<\/summary>/)
  expect(notes).toMatch(/https:\/\/urls.greenkeeper.io/)
})

test('get-release from tag with version as name', async () => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(404)
    .get('/repos/finnp/test/releases/tags/1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">',
      name: '1.33.7'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7'
  })

  expect(notes).toMatch(/<summary>Release Notes for 1.33.7<\/summary>/)
  expect(notes).toMatch(/https:\/\/urls.greenkeeper.io/)
})

test('get-release from tag at sha', async () => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(404)
    .get('/repos/finnp/test/releases/tags/1.33.7')
    .reply(404)
    .get('/repos/finnp/test/git/tags/deadbeef')
    .reply(200, {
      tag: 'lolwat'
    })
    .get('/repos/finnp/test/releases/tags/lolwat')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">',
      tag_name: '1.33.7'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7',
    sha: 'deadbeef'
  })

  expect(notes).toMatch(/<summary>Release Notes for 1.33.7<\/summary>/)
  expect(notes).toMatch(/https:\/\/urls.greenkeeper.io/)
})
