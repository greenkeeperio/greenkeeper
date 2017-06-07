const { test } = require('tap')
const _ = require('lodash')
const proxyquire = require('proxyquire')
const nock = require('nock')

test('get changelog', async t => {
  const getInfos = proxyquire('../../lib/get-infos', {
    './get-diff-commits': () => {
      return 'diff commits'
    }
  })

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/finnp/test/releases/tags/v2.2.2')
    .reply(200, {
      body_html: 'Cool new features! also fixed <a href="https://github.com/finnp/test/issues/1">#1</a>',
      name: 'thename',
      html_url: 'http://github.com/link/to/thing'
    })

  const infos = await getInfos({
    installationId: '123',
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
