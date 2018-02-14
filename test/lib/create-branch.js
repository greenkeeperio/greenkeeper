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
/* test('change one file (package.json)', async () => {
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
  */

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
    console.log('################################################')
    console.log('################################################')
    console.log('################################################')
    console.log('TEST 3')

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
      .post('/repos/owner/repo/git/trees'/*, {
        tree: [
          {
            path: 'package.json',
            content: 'TESTDATA',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: '123abc2'
      } */)
      .reply(201, (uri, requestBody) => {
        console.log('requestBody', requestBody)
        return {sha: 'def457'}
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

    /*
      - does branch have 2 correct commits?
      - are the transforms correct? (by checking content in reply requestBody)
    */

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
          message: 'pkg',
          transform: (old, path) => {
            console.log('old', old ? JSON.parse(old) : 'no old :(')
            console.log('path', path)
            return createTransformFunction('dependencies', 'react', '2.0.0', console)(old)
          }
        }
      ]
    })

    // t.equal(sha, '789beef2', 'sha')
  })
})
