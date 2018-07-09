const nock = require('nock')

describe('get-infos', () => {
  test('get changelog', async () => {
    jest.mock('../../lib/get-diff-commits', () => () => {
      return 'diff commits'
    })
    const getInfos = require('../../lib/get-infos')

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
      relevantDependencies: [],
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

    expect(infos.dependencyLink).toEqual('https://github.com/finnp/test')
    expect(infos.diffCommits).toEqual('diff commits')
    expect(infos.release).toMatch(/Cool new features/)
    expect(infos.release).toMatch(/thename/)
    expect(infos.release).toMatch(/https:\/\/urls.greenkeeper.io\/finnp\/test\/issues\/1/)
  })

  test('get changelog without credits', async () => {
    jest.mock('../../lib/get-diff-commits', () => () => {
      return 'diff commits'
    })
    const getInfos = require('../../lib/get-infos')

    const body = `<h3>Minor Changes</h3>
    <ul>
      <li> Did the thing!
    </ul>
    <h3>Fixes</h3>
    <ul>
      <li> Something Something...
    </ul>
    <h3>Patches</h3>
    <ul>
      <li> Cookie is now round and delicious!
    </ul>
    <h3>Credits</h3>
      <p>Huge thanks to <a class="user-mention" data-hovercard-user-id="1111" data-octo-click="hovercard-link-click" data-octo-dimensions="link_type:self" href="https://github.com/finnp">@finnp</a> <a class="user-mention" data-hovercard-user-id="22222" data-octo-click="hovercard-link-click" data-octo-dimensions="link_type:self" href="https://github.com/realtin">@realtin</a>" for helping!</p>`

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
        body_html: body,
        name: 'thename',
        html_url: 'http://github.com/link/to/thing'
      })

    const infos = await getInfos({
      installationId: '123',
      dependency: '@finnpauls/dep',
      version: '2.2.2',
      diffBase: '1.0.0',
      relevantDependencies: [],
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

    expect(infos.dependencyLink).toEqual('https://github.com/finnp/test')
    expect(infos.diffCommits).toEqual('diff commits')
    expect(infos.release).toMatch(/Did the thing!/)
    expect(infos.release).toMatch(/Cookie is now round and delicious!/)
    expect(infos.release).not.toMatch(/https:\/\/github.com\/finnp/)
    expect(infos.release).not.toMatch(/@realtin/)
    expect(infos.release).not.toMatch(/@finnp/)
  })

  test('get changelog for monorepo dependency', async () => {
    jest.mock('../../lib/get-diff-commits', () => () => {
      return 'diff commits'
    })
    const getInfos = require('../../lib/get-infos')

    nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/pouchdb/pouchdb/releases/tags/v2.2.2')
      .reply(200, {
        body_html: 'Cool new features! also fixed <a href="https://github.com/pouchdb/pouchdb/issues/1">#1</a>',
        name: 'thename',
        html_url: 'http://github.com/link/to/thing'
      })

    const infos = await getInfos({
      installationId: '123',
      dependency: 'pouchdb-core',
      version: '2.2.2',
      diffBase: '1.0.0',
      monorepoGroupName: 'pouchdb',
      versions: {
        '1.0.0': {
          gitHead: 'deadbeef100'
        },
        '2.2.2': {
          gitHead: 'deadbeef222',
          repository: {
            url: 'https://github.com/pouchdb/pouchdb'
          }
        }
      }
    })

    expect(infos.dependencyLink).toEqual('https://github.com/pouchdb/pouchdb')
    expect(infos.diffCommits).toEqual('diff commits')
    expect(infos.release).toMatch(/Cool new features/)
    expect(infos.release).toMatch(/thename/)
    expect(infos.release).toMatch(/https:\/\/urls.greenkeeper.io\/pouchdb\/pouchdb\/issues\/1/)
  })
})
