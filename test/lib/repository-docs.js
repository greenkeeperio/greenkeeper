const nock = require('nock')

const { createDocs, updateRepoDoc } = require('../../lib/repository-docs')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('updateRepoDoc with package.json', async () => {
  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
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

  const doc = await updateRepoDoc('123', { fullName: 'owner/repo' })
  expect(doc.packages['package.json'].name).toEqual('test')
  expect(doc.files['package-lock.json']).toHaveLength(1)
  expect(doc.files['package.json']).toHaveLength(1)
  expect(doc.files['yarn.lock']).toHaveLength(0)
})

test('get invalid package.json', async () => {
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
      content: Buffer.from('test').toString('base64')
    })

  const doc = await updateRepoDoc('123', {
    fullName: 'owner/repo',
    packages: {
      'package.json': {
        name: 'test'
      }
    }
  })
  expect(doc.packages).not.toContain('package.json')
  expect(doc.packages).toMatchObject({})
  expect(doc.files['package.json']).toHaveLength(1)
  expect(doc.files['package-lock.json']).toHaveLength(0)
  expect(doc.files['yarn.lock']).toHaveLength(0)
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
