const nock = require('nock')
const { test } = require('tap')

const Github = require('../../lib/github')

const { createDocs, setPackageJson } = require('../../lib/repository-docs')

test('get package.json', async t => {
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token secret' }
  })
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      content: Buffer.from(JSON.stringify({ name: 'test' })).toString('base64')
    })

  const github = Github()
  github.authenticate({
    type: 'token',
    token: 'secret'
  })

  const doc = await setPackageJson(github, { fullName: 'owner/repo' })
  t.is(doc.packages['package.json'].name, 'test')
  t.end()
})

test('get invalid package.json', async t => {
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token secret' }
  })
    .get('/repos/owner/repo/contents/package.json')
    .reply(200, {
      type: 'file',
      content: Buffer.from('test').toString('base64')
    })

  const github = Github()
  github.authenticate({
    type: 'token',
    token: 'secret'
  })

  const doc = await setPackageJson(github, {
    fullName: 'owner/repo',
    packages: {
      'package.json': {
        name: 'test'
      }
    }
  })
  t.notOk(doc.packages['package.json'])
  t.end()
})

test('create docs', async t => {
  const docs = await createDocs({
    repositories: [
      { id: 1, full_name: 'owner/repo1' },
      { id: 2, full_name: 'owner/repo2' }
    ],
    accountId: '123'
  })
  t.is(docs[0]._id, '1')
  t.is(docs[0].type, 'repository')
  t.is(docs[1]._id, '2')
  t.is(docs[1].type, 'repository')
  t.end()
})
