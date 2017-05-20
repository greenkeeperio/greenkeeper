const nock = require('nock')
const { test } = require('tap')
const _ = require('lodash')
const Github = require('../../lib/github')

const getRelease = require('../../lib/get-release')

test('get-release from tag with v prefix', async t => {
  nock('https://api.github.com', {
    reqheaders: {
      Accept: 'application/vnd.github.machine-man-preview.v3.html+json',
      Authorization: 'token secret'
    }
  })
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">'
    })

  const github = Github()
  github.authenticate({ type: 'token', token: 'secret' })

  const notes = await getRelease({
    github,
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
  nock('https://api.github.com', {
    reqheaders: {
      Accept: 'application/vnd.github.machine-man-preview.v3.html+json',
      Authorization: 'token secret'
    }
  })
    .get('/repos/finnp/test/releases/tags/v1.33.7')
    .reply(404)
    .get('/repos/finnp/test/releases/tags/1.33.7')
    .reply(200, {
      body_html: 'body <a href="https://github.com/greenkeeperio/greenkeeper">'
    })

  const github = Github()
  github.authenticate({ type: 'token', token: 'secret' })

  const notes = await getRelease({
    github,
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
  nock('https://api.github.com', {
    reqheaders: {
      Authorization: 'token secret'
    }
  })
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

  const github = Github()
  github.authenticate({ type: 'token', token: 'secret' })

  const notes = await getRelease({
    github,
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
