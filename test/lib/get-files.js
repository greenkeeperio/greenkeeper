const nock = require('nock')
const { test } = require('tap')

const { getFiles, formatPackageJson, getGreenkeeperConfigFile, getPackagePathsFromConfigFile } = require('../../lib/get-files')

nock.disableNetConnect()

test('getFiles: with no fileList provided', async t => {
  t.plan(1)

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})

  const files = await getFiles('123', 'owner/repo')

  t.true(Object.keys(files).length === 4, 'returns an Object with the 4 standard files')
  t.end()
})

test('getFiles: 2 package.json files', async t => {
  t.plan(7)

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
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

  const files = await getFiles('123', 'owner/repo', fileList)
  t.is(Object.keys(files).length, 4, 'returns an Object with the 4 file types')
  t.is(files['package.json'].length, 2, 'The Object has 2 files at the `package.json` key')
  t.is(files['package.json'][0].path, 'package.json')
  t.is(files['package.json'][0].content, 'eyJuYW1lIjoidGVzdCJ9')
  t.is(files['package.json'][1].path, 'backend/package.json')
  t.is(files['package.json'][1].content, 'eyJuYW1lIjoidGVzdCJ9')
  t.is(files['yarn.lock'].length, 2)
  t.end()
})

test('getFiles: 2 package.json files but one is not found on github', async t => {
  t.plan(6)

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
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

  const files = await getFiles('123', 'owner/repo', fileList)

  t.true(Object.keys(files).length === 4 && files['package.json'], 'returns an Object with the key `package.json`')
  t.is(files['package.json'].length, 2, 'The Object has 2 files at the `package.json` key')
  t.is(files['package.json'][0].path, 'package.json')
  t.is(files['package.json'][0].content, false, 'content for the package.json file that was not found set to `false`')
  t.is(files['package.json'][1].path, 'backend/package.json')
  t.is(files['package.json'][1].content, 'eyJuYW1lIjoidGVzdCJ9')
  t.end()
})

test('formatPackageJson: 2 package.json files', async t => {
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

  t.same(output, expected, 'returns an Object with two package.json files and their paths as a key')
  t.end()
})

test('formatPackageJson: 2 package.json files but one was not found on github', async t => {
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

  t.same(output, expected, 'returns an Object with one package.json file')
  t.end()
})

test('formatPackageJson: for a missing package.json array', async t => {
  const input = undefined
  const output = formatPackageJson(input)

  t.same(output, null, 'returns null')
  t.end()
})

test('getGreenkeeperConfigFile', async t => {
  t.plan(1)

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
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/owner/repo/contents/greenkeeper.json')
    .reply(200, {
      type: 'file',
      path: 'greenkeeper.json',
      name: 'greenkeeper.json',
      content: Buffer.from(JSON.stringify(configFileContent)).toString('base64')
    })

  const result = await getGreenkeeperConfigFile('123', 'owner/repo')

  t.same(result, configFileContent, 'returns the content of the `greenkeeper.json`')
  t.end()
})

test('getGreenkeeperConfigFile: when no config file is present', async t => {
  t.plan(1)

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .get('/repos/owner/repo/contents/greenkeeper.json')
    .reply(404)

  const result = await getGreenkeeperConfigFile('123', 'owner/repo')

  t.same(result, {}, 'returns empty Object')
  t.end()
})

test('getPackagePathsFromConfigFile', async t => {
  t.plan(1)

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

  t.same(result, [
    'apps/backend/hapiserver/package.json',
    'apps/backend/bla/package.json',
    'apps/frontend/react/package.json',
    'apps/frontend/react-native/package.json'
  ], 'returns all paths in an array')
  t.end()
})
