const nock = require('nock')

const createBranch = require('../../../lib/create-branch')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('create branch with yarn workspace lockfiles', () => {
  test('handle a simple yarn workspace', async () => {
    expect.assertions(8)
    const packages = {
      'package.json': {
        dependencies: {
          react: '1.0.0'
        },
        workspaces: ['jobs/*']
      },
      'jobs/first-job/package.json': {
        dependencies: {
          react: '1.0.0'
        }
      }
    }
    const updatedPackages = {
      'package.json': {
        dependencies: {
          react: '2.0.0'
        },
        workspaces: ['jobs/*']
      },
      'jobs/first-job/package.json': {
        dependencies: {
          react: '2.0.0'
        }
      }
    }
    const gitHubNock = nock('https://api.github.com')
      .post('/app/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/espy/yarn-workspaces-lockfile/contents/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(packages['package.json'])).toString('base64')
      })
      .get('/repos/espy/yarn-workspaces-lockfile/contents/jobs/first-job/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(packages['jobs/first-job/package.json'])).toString('base64')
      })
      // get yarn lock
      .get('/repos/espy/yarn-workspaces-lockfile/contents/yarn.lock')
      .reply(200, {
        type: 'file',
        path: 'yarn.lock',
        name: 'yarn.lock',
        content: Buffer.from('{"very-excellent-lockfile":"nah"}').toString('base64')
      })
      // get sha for master
      .get('/repos/espy/yarn-workspaces-lockfile/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: 'master-sha'
        }
      })
      // make 2 commits (update package.json & lockfile)
      // tree for package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'package.json',
            content: JSON.stringify(updatedPackages['package.json']),
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'jobs/first-job/package.json-commit-sha'
      })
      .reply(201, {
        sha: 'package.json-tree'
      })
      // commit for package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'new commit to update package.json',
        tree: 'package.json-tree',
        parents: ['jobs/first-job/package.json-commit-sha']
      })
      .reply(201, {
        sha: 'package.json-commit-sha'
      })
      // tree for 2. package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'jobs/first-job/package.json',
            content: JSON.stringify(updatedPackages['jobs/first-job/package.json']),
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'master-sha'
      })
      .reply(201, {
        sha: 'jobs/first-job/package.json-tree-sha'
      })
      // commit for package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'new commit to update jobs/first-job/package.json',
        tree: 'jobs/first-job/package.json-tree-sha',
        parents: ['master-sha']
      })
      .reply(201, {
        sha: 'jobs/first-job/package.json-commit-sha'
      })
      // tree and commit for yarn.lock
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'yarn.lock',
            content: '{"very-excellent-lockfile":"yes"}',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'package.json-commit-sha'
      })
      .reply(201, {
        sha: 'yarn.lock-tree-sha'
      })
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'Updated lockfile yarn.lock, yay',
        tree: 'yarn.lock-tree-sha',
        parents: ['package.json-commit-sha']
      })
      .reply(201, {
        sha: 'yarn.lock-commit-sha'
      })
      .post('/repos/espy/yarn-workspaces-lockfile/git/refs', {
        ref: 'refs/heads/testBranch',
        sha: 'yarn.lock-commit-sha'
      })
      .reply(201)

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.workspaceRoot).toBe('string')
        expect(typeof body.packageJson).toBe('undefined')
        expect(typeof body.packages).toBe('object')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: '{"very-excellent-lockfile":"yes"}'
        }
      })
    const sha = await createBranch({
      installationId: '123',
      owner: 'espy',
      repoName: 'yarn-workspaces-lockfile',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'jobs/first-job/package.json',
          transform: oldPkg => JSON.stringify(updatedPackages['jobs/first-job/package.json']),
          message: 'new commit to update jobs/first-job/package.json'
        }, {
          path: 'package.json',
          transform: oldPkg => JSON.stringify(updatedPackages['package.json']),
          message: 'new commit to update package.json'
        }
      ],
      processLockfiles: true,
      commitMessageTemplates: { 'lockfileUpdate': 'Updated lockfile ${lockfilePath}, yay' }, // eslint-disable-line no-template-curly-in-string
      repoDoc: {
        _id: 'yarn-workspaces-lockfile',
        accountId: '123',
        fullName: 'espy/yarn-workspaces-lockfile',
        private: false,
        files: {
          'package.json': ['package.json', 'jobs/first-job/package.json'],
          'package-lock.json': [],
          'npm-shrinkwrap.json': [],
          'yarn.lock': ['yarn.lock']
        },
        packages
      }
    })
    expect(sha).toEqual('yarn.lock-commit-sha')
    expect(gitHubNock.isDone()).toBeTruthy()
  })

  test('handle a complex yarn workspace', async () => {
    expect.assertions(8)
    const packages = {
      'non-root/package.json': {
        dependencies: {
          nothing: '1.0.0'
        },
        workspaces: ['jobs/*', 'docs']
      },
      'non-root/jobs/first-job/package.json': {
        dependencies: {
          react: '1.0.0'
        }
      },
      'non-root/jobs/second-job/package.json': {
        dependencies: {
          react: '1.0.0'
        }
      },
      'non-root/docs/package.json': {
        dependencies: {
          react: '1.0.0'
        }
      },
      'non-root/outside-workspace/package.json': {
        dependencies: {
          nothing: '1.0.0'
        }
      }
    }
    const updatedPackages = {
      'non-root/package.json': {
        dependencies: {
          nothing: '1.0.0'
        },
        workspaces: ['jobs/*', 'docs']
      },
      'non-root/jobs/first-job/package.json': {
        dependencies: {
          react: '2.0.0'
        }
      },
      'non-root/jobs/second-job/package.json': {
        dependencies: {
          react: '2.0.0'
        }
      },
      'non-root/docs/package.json': {
        dependencies: {
          react: '2.0.0'
        }
      },
      'non-root/outside-workspace/package.json': {
        dependencies: {
          nothing: '1.0.0'
        }
      }
    }

    const gitHubNock = nock('https://api.github.com')
      .post('/app/installations/123/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200)
      .get('/repos/espy/yarn-workspaces-lockfile/contents/non-root/jobs/first-job/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(packages['non-root/jobs/first-job/package.json'])).toString('base64')
      })
      .get('/repos/espy/yarn-workspaces-lockfile/contents/non-root/jobs/second-job/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(packages['non-root/jobs/second-job/package.json'])).toString('base64')
      })
      .get('/repos/espy/yarn-workspaces-lockfile/contents/non-root/docs/package.json')
      .query({ ref: 'master' })
      .reply(200, {
        type: 'file',
        content: Buffer.from(JSON.stringify(packages['non-root/docs/package.json'])).toString('base64')
      })
      // get yarn lock
      .get('/repos/espy/yarn-workspaces-lockfile/contents/non-root/yarn.lock')
      .reply(200, {
        type: 'file',
        path: 'non-root/yarn.lock',
        name: 'yarn.lock',
        content: Buffer.from('{"very-excellent-lockfile":"nah"}').toString('base64')
      })
      // get sha for master
      .get('/repos/espy/yarn-workspaces-lockfile/git/refs/heads/master')
      .reply(200, {
        object: {
          sha: 'master-sha'
        }
      })
      // create commits
      // tree for 1-job package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'non-root/jobs/first-job/package.json',
            content: JSON.stringify(updatedPackages['non-root/jobs/first-job/package.json']),
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'master-sha'
      })
      .reply(201, {
        sha: 'non-root/jobs/first-job/package.json-tree-sha'
      })
      // commit for 1-job package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'new commit to update non-root/jobs/first-job/package.json',
        tree: 'non-root/jobs/first-job/package.json-tree-sha',
        parents: ['master-sha']
      })
      .reply(201, {
        sha: 'non-root/jobs/first-job/package.json-commit-sha'
      })
      // tree for 2-job package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'non-root/jobs/second-job/package.json',
            content: JSON.stringify(updatedPackages['non-root/jobs/second-job/package.json']),
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'non-root/jobs/first-job/package.json-commit-sha'
      })
      .reply(201, {
        sha: 'non-root/jobs/second-job/package.json-tree-sha'
      })
      // commit for 2-job package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'new commit to update non-root/jobs/second-job/package.json',
        tree: 'non-root/jobs/second-job/package.json-tree-sha',
        parents: ['non-root/jobs/first-job/package.json-commit-sha']
      })
      .reply(201, {
        sha: 'non-root/jobs/second-job/package.json-commit-sha'
      })
    // tree for docs. package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'non-root/docs/package.json',
            content: JSON.stringify(updatedPackages['non-root/docs/package.json']),
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'non-root/jobs/second-job/package.json-commit-sha'
      })
      .reply(201, {
        sha: 'non-root/docs/package.json-tree-sha'
      })
    // commit for docs/package.json
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'new commit to update non-root/docs/package.json',
        tree: 'non-root/docs/package.json-tree-sha',
        parents: ['non-root/jobs/second-job/package.json-commit-sha']
      })
      .reply(201, {
        sha: 'non-root/docs/package.json-commit-sha'
      })
      // tree and commit for yarn.lock
      .post('/repos/espy/yarn-workspaces-lockfile/git/trees', {
        tree: [
          {
            path: 'non-root/yarn.lock',
            content: '{"very-excellent-lockfile":"yes"}',
            mode: '100644',
            type: 'blob'
          }
        ],
        base_tree: 'non-root/docs/package.json-commit-sha'
      })
      .reply(201, {
        sha: 'yarn.lock-tree-sha'
      })
      .post('/repos/espy/yarn-workspaces-lockfile/git/commits', {
        message: 'Updated lockfile non-root/yarn.lock, yay',
        tree: 'yarn.lock-tree-sha',
        parents: ['non-root/docs/package.json-commit-sha']
      })
      .reply(201, {
        sha: 'yarn.lock-commit-sha'
      })
      .post('/repos/espy/yarn-workspaces-lockfile/git/refs', {
        ref: 'refs/heads/testBranch',
        sha: 'yarn.lock-commit-sha'
      })
      .reply(201)

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.workspaceRoot).toBe('string')
        expect(typeof body.packageJson).toBe('undefined')
        expect(typeof body.packages).toBe('object')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: '{"very-excellent-lockfile":"yes"}'
        }
      })

    const sha = await createBranch({
      installationId: '123',
      owner: 'espy',
      repoName: 'yarn-workspaces-lockfile',
      branch: 'master',
      newBranch: 'testBranch',
      transforms: [
        {
          path: 'non-root/jobs/first-job/package.json',
          transform: oldPkg => JSON.stringify(updatedPackages['non-root/jobs/first-job/package.json']),
          message: 'new commit to update non-root/jobs/first-job/package.json'
        },
        {
          path: 'non-root/jobs/second-job/package.json',
          transform: oldPkg => JSON.stringify(updatedPackages['non-root/jobs/second-job/package.json']),
          message: 'new commit to update non-root/jobs/second-job/package.json'
        },
        {
          path: 'non-root/docs/package.json',
          transform: oldPkg => JSON.stringify(updatedPackages['non-root/docs/package.json']),
          message: 'new commit to update non-root/docs/package.json'
        }
      ],
      processLockfiles: true,
      commitMessageTemplates: { 'lockfileUpdate': 'Updated lockfile ${lockfilePath}, yay' }, // eslint-disable-line no-template-curly-in-string
      repoDoc: {
        _id: 'yarn-workspaces-lockfile',
        accountId: '123',
        fullName: 'espy/yarn-workspaces-lockfile',
        private: false,
        files: {
          'package.json': ['non-root/package.json', 'non-root/jobs/first-job/package.json', 'non-root/jobs/second-job/package.json', 'non-root/docs/package.json', 'non-root/outside-workspace/package.json'],
          'package-lock.json': [],
          'npm-shrinkwrap.json': [],
          'yarn.lock': ['non-root/yarn.lock']
        },
        packages
      }
    })
    expect(sha).toEqual('yarn.lock-commit-sha')
    expect(gitHubNock.isDone()).toBeTruthy()
  })
})
// TODO repo has yarn.lock and package-lock.json?
