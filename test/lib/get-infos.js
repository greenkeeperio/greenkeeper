const { test } = require('tap')
const _ = require('lodash')
const proxyquire = require('proxyquire')
const nock = require('nock')
const Github = require('../../lib/github')

test('get changelog', async t => {
  const getInfos = proxyquire('../../lib/get-infos', {
    './get-diff-commits': () => {
      return 'diff commits'
    }
  })

  nock('https://api.github.com', {
    reqheaders: {
      Authorization: 'token secret'
    }
  })
    .get('/repos/finnp/test/releases/tags/v2.2.2')
    .reply(200, {
      body_html: 'Cool new features! also fixed <a href="https://github.com/finnp/test/issues/1">#1</a>',
      name: 'thename',
      html_url: 'http://github.com/link/to/thing'
    })

  const github = Github()
  github.authenticate({ type: 'token', token: 'secret' })

  const infos = await getInfos({
    github,
    dependency: '@finnpauls/dep',
    version: '2.2.2',
    diffBase: '1.0.0',
    versions: {
      '1.0.0': {
        gitHead: 'deadbeef100'
      },
      '2.2.2': {
        gitHead: 'deadbeef222',
        repository: {
          url: 'https://github.com/finnp/test'
        }
      }
    }
  })

  t.is(
    infos.dependencyLink,
    '[@finnpauls/dep](https://github.com/finnp/test)',
    'dependencyLink'
  )
  t.is(infos.diffCommits, 'diff commits', 'diffCommits')
  t.ok(_.includes(infos.release, 'Cool new features'))
  t.ok(
    _.includes(
      infos.release,
      'https://urls.greenkeeper.io/finnp/test/issues/1'
    ),
    'replaced link correctly'
  )
  t.ok(_.includes(infos.release, 'thename'))
  t.end()
})
