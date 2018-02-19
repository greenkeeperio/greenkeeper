const nock = require('nock')

test('get changelog', async () => {
  const getInfos = require('../../lib/get-infos')
  jest.mock('../../lib/get-diff-commits', () => () => {
    return 'diff commits'
  })

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
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

  expect(infos.dependencyLink).toEqual('[@finnpauls/dep](https://github.com/finnp/test)')
  expect(infos.diffCommits).toEqual('diff commits')
  expect(infos.release).toMatch(/Cool new features/)
  expect(infos.release).toMatch(/thename/)
  expect(infos.release).toMatch(/https:\/\/urls.greenkeeper.io\/finnp\/test\/issues\/1/)
})
