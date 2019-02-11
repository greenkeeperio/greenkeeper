const nock = require('nock')

const { getFiles, formatPackageJson, discoverPackageFiles, discoverPackageFilePaths, getGreenkeeperConfigFile, getPackagePathsFromConfigFile } = require('../../lib/get-files')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

const log = console

test('getFiles: with no fileList provided', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})

  const files = await getFiles({ installationId: '123', fullName: 'owner/repo', log })

  // returns an Object with the 4 standard files
  expect(Object.keys(files)).toHaveLength(4)
})

test('getFiles: 2 package.json files', async () => {
  expect.assertions(7)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/backend/package.json')
    .reply(200, {
      type: 'file',
      path: 'backend/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/backend/yarn.lock')
    .reply(200, {
      type: 'file',
      path: 'backend/yarn.lock',
      name: 'yarn.lock',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })

  const fileList = [
    'package.json',
    'backend/package.json'
  ]

  const files = await getFiles({ installationId: '123', fullName: 'owner/repo', files: fileList, log })
  // returns an Object with the 4 file types
  expect(Object.keys(files)).toHaveLength(4)
  // The Object has 2 files at the `package.json` key
  expect(files['package.json']).toHaveLength(2)
  expect(files['package.json'][0].path).toEqual('package.json')
  expect(files['package.json'][0].content).toEqual('eyJuYW1lIjoidGVzdCJ9')
  expect(files['package.json'][1].path).toEqual('backend/package.json')
  expect(files['package.json'][1].content).toEqual('eyJuYW1lIjoidGVzdCJ9')
  expect(files['yarn.lock']).toHaveLength(2)
})

test('getFiles: 2 package.json files but one is not found on github', async () => {
  expect.assertions(7)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/contents/backend/package.json')
    .reply(200, {
      type: 'file',
      path: 'backend/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })

  const fileList = [
    'package.json',
    'backend/package.json'
  ]

  const files = await getFiles({ installationId: '123', fullName: 'owner/repo', files: fileList, log })

  expect(Object.keys(files)).toHaveLength(4)
  // returns an Object with the key `package.json`
  expect(files['package.json']).toBeDefined()
  // The Object has 2 files at the `package.json` key
  expect(files['package.json']).toHaveLength(2)
  expect(files['package.json'][0].path).toEqual('package.json')
  // content for the package.json file that was not found set to `false`
  expect(files['package.json'][0].content).toEqual(false)
  expect(files['package.json'][1].path).toEqual('backend/package.json')
  expect(files['package.json'][1].content).toEqual('eyJuYW1lIjoidGVzdCJ9')
})

test('getFiles: too large package-lock.json', async () => {
  expect.assertions(5)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, { token: 'secret' })
    .get('/rate_limit')
    .optionally()
    .reply(200)
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/package-lock.json')
    .reply(403, {
      message: 'This API returns blobs up to 1 MB in size. The requested blob is too large to fetch via the API, but you can use the Git Data API to request blobs up to 100 MB in size.',
      status: 'too_large',
      code: 'too_large'
    })
    .get('/repos/owner/repo/git/trees/1312')
    .reply(200, {
      'sha': 'db6dbefcd2e2dfc46c3169dacd3472c06ac1c1a2',
      'tree': [{
        'path': 'package-lock.json',
        'type': 'blob',
        'sha': 'allcatsarebeautiful',
        'url': 'https://api.github.com/repos/owner/repo/git/blobs/allcatsarebeautiful'
      },
      {
        'path': 'package.json',
        'type': 'blob',
        'sha': 'allcatsarebeautifulcats',
        'url': 'https://api.github.com/repos/owner/repo/git/blobs/allcatsarebeautifulcats'
      }]
    })
    .get('/repos/owner/repo/git/blobs/allcatsarebeautiful')
    .reply(200, {
      content: Buffer.from(JSON.stringify({ name: 'all cats are beautiful' })).toString('base64')
    })

  const fileList = [ 'package.json' ]

  const files = await getFiles({ installationId: '123', fullName: 'owner/repo', files: fileList, sha: '1312', log })
  expect(files['package.json']).toHaveLength(1)
  expect(files['package.json'][0].path).toEqual('package.json')
  expect(files['package.json'][0].content).toEqual('eyJuYW1lIjoidGVzdCJ9')
  expect(files['package-lock.json'][0].path).toEqual('package-lock.json')
  expect(files['package-lock.json'][0].content).toEqual('eyJuYW1lIjoiYWxsIGNhdHMgYXJlIGJlYXV0aWZ1bCJ9')
})

test('formatPackageJson: 2 package.json files', async () => {
  const input = [
    { type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: 'eyJuYW1lIjoidGVzdCJ9' },
    { type: 'file',
      path: 'backend/package.json',
      name: 'package.json',
      content: 'eyJuYW1lIjoidGVzdCJ9' }
  ]
  const output = formatPackageJson(input)
  const expected = {
    'package.json': { name: 'test' },
    'backend/package.json': { name: 'test' }
  }

  // returns an Object with two package.json files and their paths as a key
  expect(output).toMatchObject(expected)
})

test('formatPackageJson: 2 package.json files but one was not found on github', async () => {
  const input = [
    { type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: false },
    { type: 'file',
      path: 'backend/package.json',
      name: 'package.json',
      content: 'eyJuYW1lIjoidGVzdCJ9' }
  ]
  const output = formatPackageJson(input)
  const expected = {
    'backend/package.json': { name: 'test' }
  }

  // returns an Object with one package.json file
  expect(output).toMatchObject(expected)
})

test('formatPackageJson: for a missing package.json array', async () => {
  const input = undefined
  const output = formatPackageJson(input)

  // returns null
  expect(output).toBeNull()
})

test('getGreenkeeperConfigFile', async () => {
  expect.assertions(1)

  const configFileContent = {
    groups: {
      backend: {
        ignore: [
          'lodash'
        ],
        packages: [
          'apps/backend/hapiserver/package.json',
          'apps/backend/bla/package.json'
        ]
      },
      frontend: {
        ignore: [
          'lodash'
        ],
        packages: [
          'apps/frontend/react/package.json',
          'apps/frontend/react-native/package.json'
        ]
      }
    }
  }

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/contents/greenkeeper.json')
    .reply(200, {
      type: 'file',
      path: 'greenkeeper.json',
      name: 'greenkeeper.json',
      content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
    })

  const result = await getGreenkeeperConfigFile('123', 'owner/repo')

  // returns the content of the `greenkeeper.json`
  expect(result).toMatchObject(configFileContent)
})

test('getGreenkeeperConfigFile: when no config file is present', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/contents/greenkeeper.json')
    .reply(404)

  const result = await getGreenkeeperConfigFile('123', 'owner/repo')

  // returns empty Object
  expect(result).toMatchObject({})
})

test('getPackagePathsFromConfigFile', async () => {
  expect.assertions(1)

  const input = {
    groups: {
      backend: {
        ignore: [
          'lodash'
        ],
        packages: [
          'apps/backend/hapiserver/package.json',
          'apps/backend/bla/package.json'
        ]
      },
      frontend: {
        ignore: [
          'lodash'
        ],
        packages: [
          'apps/frontend/react/package.json',
          'apps/frontend/react-native/package.json'
        ]
      }
    }
  }
  const result = await getPackagePathsFromConfigFile(input)

  // returns all paths in an array
  expect(result).toEqual([
    'apps/backend/hapiserver/package.json',
    'apps/backend/bla/package.json',
    'apps/frontend/react/package.json',
    'apps/frontend/react-native/package.json'
  ])
})

test('discoverPackageFiles: regular repo', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/git/trees/master?recursive=1')
    .reply(200, {
      tree: [
        {
          'path': 'package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        }
      ]
    })
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
  const result = await discoverPackageFiles({
    installationId: '123',
    fullName: 'owner/repo',
    defaultBranch: 'master',
    log: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  })
  expect(result).toEqual([{ 'content': 'eyJuYW1lIjoidGVzdCJ9', 'name': 'package.json', 'path': 'package.json', 'type': 'file' }])
})

test('discoverPackageFiles: monorepo', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/git/trees/master?recursive=1')
    .reply(200, {
      tree: [
        {
          'path': 'package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'frontend/package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'backend/package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'elm/elm-package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        }
      ]
    })
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      path: 'package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/frontend/package.json')
    .reply(200, {
      type: 'file',
      path: 'frontend/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/backend/package.json')
    .reply(200, {
      type: 'file',
      path: 'backend/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/elm/elm-package.json')
    .reply(200, {
      type: 'file',
      path: 'elm/elm-package.json',
      name: 'elm-package.json',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })

  const result = await discoverPackageFiles({
    installationId: '123',
    fullName: 'owner/repo',
    defaultBranch: 'master',
    log: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  })
  expect(result).toEqual([
    { 'content': 'eyJuYW1lIjoidGVzdCJ9', 'name': 'package.json', 'path': 'package.json', 'type': 'file' },
    { 'content': 'eyJuYW1lIjoidGVzdCJ9', 'name': 'package.json', 'path': 'frontend/package.json', 'type': 'file' },
    { 'content': 'eyJuYW1lIjoidGVzdCJ9', 'name': 'package.json', 'path': 'backend/package.json', 'type': 'file' }
  ])
})

test('discoverPackageFilePaths: regular repo', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/git/trees/master?recursive=1')
    .reply(200, {
      tree: [
        {
          'path': 'package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        }
      ]
    })

  const result = await discoverPackageFilePaths({
    installationId: '123',
    fullName: 'owner/repo',
    defaultBranch: 'master',
    log: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  })
  expect(result).toEqual(['package.json'])
})

test('discoverPackageFilePaths: monorepo', async () => {
  expect.assertions(1)

  nock('https://api.github.com')
    .post('/app/installations/123/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/repos/owner/repo/git/trees/master?recursive=1')
    .reply(200, {
      tree: [
        {
          'path': 'package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'frontend/package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'backend/package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'tests/package.json',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        },
        {
          'path': 'frontend/package.json.d.ts',
          'mode': '100644',
          'type': 'blob',
          'sha': 'bd086eb684aa91cab4d84390f06d7267af99798e',
          'size': 1379,
          'url': 'https://api.github.com/repos/neighbourhoodie/gk-test-lerna-yarn-workspaces/git/blobs/bd086eb684aa91cab4d84390f06d7267af99798e'
        }
      ]
    })

  const result = await discoverPackageFilePaths({
    installationId: '123',
    fullName: 'owner/repo',
    defaultBranch: 'master',
    log: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  })
  expect(result).toEqual(['package.json', 'frontend/package.json', 'backend/package.json'])
})
