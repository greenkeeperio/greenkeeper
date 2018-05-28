const nock = require('nock')

const createBranch = require('../../lib/create-branch')
const { createTransformFunction } = require('../../utils/utils')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create branch', async () => {
  test('change one file (package.json)', async () => {
    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
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
    expect(gitHubNock.isDone()).toBeTruthy()
  })

  test('change multiple files (package.json, readme.md)', async () => {
    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
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
    expect(gitHubNock.isDone()).toBeTruthy()
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
    expect.assertions(13)

    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
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

    expect(gitHubNock.isDone()).toBeTruthy()
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
    expect.assertions(18)

    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
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

    expect(gitHubNock.isDone()).toBeTruthy()
    expect(sha).toEqual('789beef2')
  })

  const testFiveData = {
    'package.json': {
      dependencies: {
        'flowers': '1.0.0',
        'flowers-pink': '1.0.0',
        'flowers-yellow': '1.0.0',
        'flowers-purple': '1.0.0'
      }
    }
  }

  test('handle monorepo-release', async () => {
    expect.assertions(15)

    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .get('/repos/bee/repo/contents/package.json?ref=master')
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testFiveData['package.json'])).toString('base64')
      })
      .get('/repos/bee/repo/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: '123abc2'
        }
      })
      .post('/repos/bee/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        const expectedContent = {
          dependencies: {
            flowers: '2.0.0',
            'flowers-pink': '1.0.0',
            'flowers-yellow': '1.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def456'}
      })
      .post('/repos/bee/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        const expectedContent = {
          dependencies: {
            flowers: '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '1.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def457'}
      })
      .post('/repos/bee/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        const expectedContent = {
          dependencies: {
            flowers: '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '2.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def458'}
      })
      .post('/repos/bee/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        const expectedContent = {
          dependencies: {
            flowers: '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '2.0.0',
            'flowers-purple': '2.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def459'}
      })
      .post('/repos/bee/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).message).toEqual('flowers')
        return {sha: '789beef0'}
      })
      .post('/repos/bee/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).message).toEqual('flowers-pink')
        return {sha: '789beef1'}
      })
      .post('/repos/bee/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).message).toEqual('flowers-yellow')
        return {sha: '789beef2'}
      })
      .post('/repos/bee/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).message).toEqual('flowers-purple')
        return {sha: '789beef3'}
      })
      .post('/repos/bee/repo/git/refs')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).sha).toEqual('789beef3')
      })

    const payload = {
      installationId: 123,
      owner: 'bee',
      repo: 'repo',
      branch: 'master',
      newBranch: 'flowersBranch',
      transforms: [
        {
          path: 'package.json',
          message: 'flowers',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers', '2.0.0', console)(old)
        },
        {
          path: 'package.json',
          message: 'flowers-pink',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-pink', '2.0.0', console)(old)
        },
        {
          path: 'package.json',
          message: 'flowers-yellow',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-yellow', '2.0.0', console)(old)
        },
        {
          path: 'package.json',
          message: 'flowers-purple',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-purple', '2.0.0', console)(old)
        }
      ]
    }

    const sha = await createBranch(payload)
    expect(sha).toEqual('789beef3')

    expect(gitHubNock.isDone()).toBeTruthy()
  })

  const testSixData = {
    'package.json': {
      dependencies: {
        'flowers-pink': '1.0.0',
        'flowers-purple': '1.0.0'
      }
    },
    'backend/package.json': {
      dependencies: {
        'flowers': '1.0.0',
        'flowers-pink': '1.0.0',
        'flowers-yellow': '1.0.0',
        'flowers-purple': '1.0.0'
      }
    }
  }

  test('handle monorepo-release and change multiple monorepo files (package.json, backend/package.json)', async () => {
    expect.assertions(33)

    const gitHubNock = nock('https://api.github.com')
      .post('/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/owner/repo/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testSixData['package.json'])).toString('base64')
      })
      .get('/repos/owner/repo/contents/backend/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(testSixData['backend/package.json'])).toString('base64')
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
        const expectedContent = {
          dependencies: {
            'flowers-pink': '2.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def450'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('package.json')
        const expectedContent = {
          dependencies: {
            'flowers-pink': '2.0.0',
            'flowers-purple': '2.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def451'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        const expectedContent = {
          dependencies: {
            'flowers': '2.0.0',
            'flowers-pink': '1.0.0',
            'flowers-yellow': '1.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def452'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        const expectedContent = {
          dependencies: {
            'flowers': '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '1.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def453'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        const expectedContent = {
          dependencies: {
            'flowers': '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '2.0.0',
            'flowers-purple': '1.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def454'}
      })
      .post('/repos/owner/repo/git/trees')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree[0].path).toEqual('backend/package.json')
        const expectedContent = {
          dependencies: {
            'flowers': '2.0.0',
            'flowers-pink': '2.0.0',
            'flowers-yellow': '2.0.0',
            'flowers-purple': '2.0.0'
          }
        }
        expect(JSON.parse(requestBody).tree[0].content).toEqual(JSON.stringify(expectedContent))
        return {sha: 'def455'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def450')
        expect(JSON.parse(requestBody).parents[0]).toEqual('123abc2')
        expect(JSON.parse(requestBody).message).toEqual('flowers-pink')
        return {sha: '789beef0'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def451')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef0')
        expect(JSON.parse(requestBody).message).toEqual('flowers-purple')
        return {sha: '789beef1'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def452')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef1')
        expect(JSON.parse(requestBody).message).toEqual('flowers')
        return {sha: '789beef2'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def453')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef2')
        expect(JSON.parse(requestBody).message).toEqual('flowers-pink')
        return {sha: '789beef3'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def454')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef3')
        expect(JSON.parse(requestBody).message).toEqual('flowers-yellow')
        return {sha: '789beef4'}
      })
      .post('/repos/owner/repo/git/commits')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).tree).toEqual('def455')
        expect(JSON.parse(requestBody).parents[0]).toEqual('789beef4')
        expect(JSON.parse(requestBody).message).toEqual('flowers-purple')
        return {sha: '789beef5'}
      })
      .post('/repos/owner/repo/git/refs')
      .reply(201, (uri, requestBody) => {
        expect(JSON.parse(requestBody).sha).toEqual('789beef5')
      })

    const payload = {
      installationId: 123,
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'package.json',
          message: 'flowers-pink',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-pink', '2.0.0', console)(old)
        },
        {
          path: 'package.json',
          message: 'flowers-purple',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-purple', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'flowers',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'flowers-pink',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-pink', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'flowers-yellow',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-yellow', '2.0.0', console)(old)
        },
        {
          path: 'backend/package.json',
          message: 'flowers-purple',
          transform: (old, path) => createTransformFunction('dependencies', 'flowers-purple', '2.0.0', console)(old)
        }
      ]
    }

    const sha = await createBranch(payload)

    expect(gitHubNock.isDone()).toBeTruthy()
    expect(sha).toEqual('789beef5')
  })
})
