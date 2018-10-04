const nock = require('nock')

const { createDocs, updateRepoDoc } = require('../../lib/repository-docs')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('updateRepoDoc with package.json', async () => {
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
    .get('/repos/owner/repo/contents/package-lock.json')
    .reply(200, {
      type: 'file',
      path: 'package-lock.json',
      name: 'package-lock.json',
      content: Buffer.from(JSON.stringify({ name: 'test2' })).toString('base64')
    })

  let doc = { fullName: 'owner/repo' }
  const args = {
    installationId: '123',
    doc,
    log: {info: () => {}, warn: () => {}, error: () => {}}
  }
  await updateRepoDoc(args)
  expect(doc.packages['package.json'].name).toEqual('test')
  expect(doc.files['package-lock.json']).toHaveLength(1)
  expect(doc.files['package.json']).toHaveLength(1)
  expect(doc.files['yarn.lock']).toHaveLength(0)
})

test('get invalid package.json', async () => {
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
      content: Buffer.from('test').toString('base64')
    })

  let doc = {
    fullName: 'owner/repo',
    packages: {
      'package.json': {
        name: 'test'
      }
    }
  }
  const args = {
    installationId: '123',
    doc,
    log: {info: () => {}, warn: () => {}, error: () => {}}
  }
  await updateRepoDoc(args)

  expect(doc.packages).not.toContain('package.json')
  expect(doc.packages).toMatchObject({})
  expect(doc.files['package.json']).toHaveLength(1)
  expect(doc.files['package-lock.json']).toHaveLength(0)
  expect(doc.files['yarn.lock']).toHaveLength(0)
})

test('updateRepoDoc with greenkeeper.json present', async () => {
  const configFileContent = {
    groups: {
      backend: {
        packages: [
          'apps/backend/hapiserver/package.json',
          'apps/backend/bla/package.json'
        ]
      },
      frontend: {
        packages: [
          'apps/frontend/react/package.json'
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
    .get('/repos/owner/repo/contents/apps/backend/hapiserver/package.json')
    .reply(200, {
      type: 'file',
      path: 'apps/backend/hapiserver/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'one' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/apps/backend/bla/package.json')
    .reply(200, {
      type: 'file',
      path: 'apps/backend/bla/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'two' })).toString('base64')
    })
    .get('/repos/owner/repo/contents/apps/frontend/react/package.json')
    .reply(200, {
      type: 'file',
      path: 'apps/frontend/react/package.json',
      name: 'package.json',
      content: Buffer.from(JSON.stringify({ name: 'three' })).toString('base64')
    })

  let doc = { fullName: 'owner/repo' }
  const args = {
    installationId: '123',
    doc,
    log: {info: () => {}, warn: () => {}, error: () => {}}
  }
  await updateRepoDoc(args)
  expect(Object.keys(doc.packages)).toHaveLength(3)
  expect(doc.packages['apps/backend/hapiserver/package.json'].name).toEqual('one')
  expect(doc.packages['apps/backend/bla/package.json'].name).toEqual('two')
  expect(doc.packages['apps/frontend/react/package.json'].name).toEqual('three')
  expect(doc.greenkeeper).toMatchObject(configFileContent)
})

test('create docs', async () => {
  const docs = await createDocs({
    repositories: [
      { id: 1, full_name: 'owner/repo1' },
      { id: 2, full_name: 'owner/repo2' }
    ],
    accountId: '123'
  })

  expect(docs[0]._id).toEqual('1')
  expect(docs[0].type).toEqual('repository')
  expect(docs[1]._id).toEqual('2')
  expect(docs[1].type).toEqual('repository')
})
