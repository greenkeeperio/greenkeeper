const nock = require('nock')

const createBranch = require('../../lib/create-branch')
const { createTransformFunction } = require('../../utils/registry-change-utils')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

function ghToken (nocked) {
  return nocked
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
}

describe('create branch', async () => {
  test('change one file (package.json)', async () => {
    ghToken(nock('https://api.github.com'))
      .get('/repos/owner/repo/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from('testdata').toString('base64')
      })
      .get('/repos/owner/repo/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: '123abc'
        }
      })
      .post('/repos/owner/repo/git/trees', {
        tree: [
          {
            path: 'package.json',
            content: 'TESTDATA',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: '123abc'
      })
      .reply(201, {
        sha: 'def456'
      })
      .post('/repos/owner/repo/git/commits', {
        message: 'new commit',
        tree: 'def456',
        parents: ['123abc']
      })
      .reply(201, {
        sha: '789beef'
      })
      .post('/repos/owner/repo/git/refs', {
        ref: 'refs/heads/testBranch',
        sha: '789beef'
      })
      .reply(201)

    const sha = await createBranch({
      installationId: 123,
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      newBranch: 'testBranch',
      path: 'package.json',
      transform: oldPkg => oldPkg.toUpperCase(),
      message: 'new commit'
    })

    expect(sha).toEqual('789beef')
  })

  test('change multiple files (package.json, readme.md)', async () => {
    ghToken(nock('https://api.github.com'))
      .get('/repos/owner/repo/readme?ref=master')
      .reply(200, {
        path: 'readme.md',
        content: Buffer.from('TESTDATA').toString('base64')
      })
      .get('/repos/owner/repo/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from('testdata').toString('base64')
      })
      .get('/repos/owner/repo/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: '123abc2'
        }
      })
      .post('/repos/owner/repo/git/trees', {
        tree: [
          {
            path: 'package.json',
            content: 'TESTDATA',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: '123abc2'
      })
      .reply(201, {
        sha: 'def457'
      })
      .post('/repos/owner/repo/git/trees', {
        tree: [
          {
            path: 'readme.md',
            content: 'testdata',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: '789beef2'
      })
      .reply(201, {
        sha: '890abc'
      })
      .post('/repos/owner/repo/git/commits', {
        message: 'pkg',
        tree: 'def457',
        parents: ['123abc2']
      })
      .reply(201, {
        sha: '789beef2'
      })
      .post('/repos/owner/repo/git/commits', {
        message: 'readme',
        tree: '890abc',
        parents: ['789beef2']
      })
      .reply(201, {
        sha: '789beef2'
      })
      .post('/repos/owner/repo/git/refs', {
        ref: 'refs/heads/testBranch',
        sha: '789beef2'
      })
      .reply(201)

    const sha = await createBranch({
      installationId: 123,
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'package.json',
          message: 'pkg',
          transform: oldPkg => oldPkg.toUpperCase()
        },
        {
          path: 'README.md',
          message: 'readme',
          transform: (old, path) => path === 'readme.md' && old.toLowerCase()
        }
      ]
    })

    expect(sha).toEqual('789beef2')
  })

  const testThreeData = {
    'package.json': {
      dependencies: {
        react: '1.0.0'
      }
    },
    'backend/package.json': {
      dependencies: {
        react: '1.0.0'
      }
    }
  }

  test('change multiple monorepo files (package.json, backend/package.json)', async () => {
    expect.assertions(12)

    ghToken(nock('https://api.github.com'))
      .get('/repos/owner/repo/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testThreeData['package.json'])).toString('base64')
      })
      .get('/repos/owner/repo/contents/backend/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testThreeData['backend/package.json'])).toString('base64')
      })
      .get('/repos/owner/repo/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: '123abc2'
        }
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        expect(JSON.parse(requestBody).tree[0].content).toEqual('{"dependencies":{"react":"2.0.0"}}')
        return {sha: 'def457'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        expect(JSON.parse(requestBody).tree[0].content).toEqual('{"dependencies":{"react":"2.0.0"}}')
        return {sha: 'def458'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def457')
        expect(JSON.parse(requestBody).parents[0]).toEqual('123abc2')
        expect(JSON.parse(requestBody).message).toEqual('pkg')
        return {sha: '789beef1'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def458')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef1')
        expect(JSON.parse(requestBody).message).toEqual('pkg2')
        return {sha: '789beef2'}
      })
      .post('/repos/owner/repo/git/refs')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).sha).toEqual('789beef2')
      })

    const sha = await createBranch({
      installationId: 123,
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'package.json',
          message: 'pkg',
          transform: (old, path) => createTransformFunction('dependencies', 'react', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'pkg2',
          transform: (old, path) => createTransformFunction('dependencies', 'react', '2.0.0', console)(old)
        }
      ]
    })

    expect(sha).toEqual('789beef2')
  })

  const testFourData = {
    'package.json': {
      dependencies: {
        standard: '1.0.0'
      }
    },
    'backend/package.json': {
      dependencies: {
        standard: '1.0.0'
      }
    }
  }

  test('generate new greenkeeper.json and change multiple monorepo files (package.json, backend/package.json)', async () => {
    expect.assertions(17)

    ghToken(nock('https://api.github.com'))
      .get('/repos/owner/repo/contents/greenkeeper.json')
      .query({ ref: 'master' })
      .reply(404, {
        message: 'Not Found'
      })
      .get('/repos/owner/repo/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testFourData['package.json'])).toString('base64')
      })
      .get('/repos/owner/repo/contents/backend/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testFourData['backend/package.json'])).toString('base64')
      })
      .get('/repos/owner/repo/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: '123abc2'
        }
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        console.log('gkj')
        expect(JSON.parse(requestBody).tree[0].path).toEqual('greenkeeper.json')
        expect(JSON.parse(requestBody).tree[0].content).toEqual('{"lol":"wat"}')
        return {sha: 'def456'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        expect(JSON.parse(requestBody).tree[0].content).toEqual('{"dependencies":{"standard":"2.0.0"}}')
        return {sha: 'def457'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        expect(JSON.parse(requestBody).tree[0].content).toEqual('{"dependencies":{"standard":"2.0.0"}}')
        return {sha: 'def458'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def456')
        expect(JSON.parse(requestBody).parents[0]).toEqual('123abc2')
        expect(JSON.parse(requestBody).message).toEqual('config')
        return {sha: '789beef0'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def457')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef0')
        expect(JSON.parse(requestBody).message).toEqual('pkg')
        return {sha: '789beef1'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def458')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef1')
        expect(JSON.parse(requestBody).message).toEqual('pkg2')
        return {sha: '789beef2'}
      })
      .post('/repos/owner/repo/git/refs')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).sha).toEqual('789beef2')
      })

    const payload = {
      installationId: 123,
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'greenkeeper.json',
          message: 'config',
          transform: () => '{"lol":"wat"}',
          create: true
        },
        {
          path: 'package.json',
          message: 'pkg',
          transform: (old, path) => createTransformFunction('dependencies', 'standard', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'pkg2',
          transform: (old, path) => createTransformFunction('dependencies', 'standard', '2.0.0', console)(old)
        }
      ]
    }

    const sha = await createBranch(payload)

    expect(sha).toEqual('789beef2')
  })
})
