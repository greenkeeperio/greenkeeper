const nock = require('nock')
const { test } = require('tap')
const _ = require('lodash')

const getRelease = require('../../lib/get-release')

test('get-release from tag with v prefix', async t => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7'
  })

  t.ok(_.includes(notes, `<summary>Release Notes</summary>`), 'release notes')
  t.ok(
    _.includes(notes, `https://urls.greenkeeper.io/`),
    'github link was replaced'
  )
  t.end()
})

test('get-release from tag with version as name', async t => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(404)
    .get('/repos/finnp/test/releases/tags/1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7'
  })

  t.ok(_.includes(notes, `<summary>Release Notes</summary>`), 'release notes')
  t.ok(
    _.includes(notes, `https://urls.greenkeeper.io/`),
    'github link was replaced'
  )
  t.end()
})

test('get-release from tag at sha', async t => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
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
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">'
    })

  const notes = await getRelease({
    installationId: '123',
    owner: 'finnp',
    repo: 'test',
    version: '1.33.7',
    sha: 'deadbeef'
  })

  t.ok(_.includes(notes, `<summary>Release Notes</summary>`), 'release notes')
  t.ok(
    _.includes(notes, `https://urls.greenkeeper.io/`),
    'github link was replaced'
  )
  t.end()
})
