const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire')

const dbs = require('../../lib/dbs')

test('open-issue', async t => {
  t.plan(29)
  const { repositories } = await dbs()

  await repositories.put({
    _id: '42',
    packages: {
      'package.json': {
        greenkeeper: {
          branchPrefix: 'prefix-',
          label: 'customlabel'
        }
      }
    }
  })

  const openIssue = proxyquire('../../lib/open-issue', {
    './create-branch': (
      { installationId, owner, repo, branch, newBranch, path, message, transform }
    ) => {
      t.ok(installationId, 'create-branch installationId')
      t.is(owner, 'finnp', 'create-branch owner')
      t.is(repo, 'testrepo', 'create-branch repo')
      t.is(branch, 'master', 'create-branch branch')
      t.is(newBranch, 'prefix-standard-pin-1.4.0', 'create-branch newBranch')
      t.is(path, 'package.json', 'create-branch path')
      t.ok(message, 'create-branch message')
      const change = transform(
        JSON.stringify({
          devDependencies: {
            standard: '~2.0.0'
          }
        })
      )
      t.is(
        change,
        JSON.stringify({
          devDependencies: {
            standard: '1.4.0'
          }
        }),
        'pinned standard to 1.4.0'
      )

      return { sha: 'deadbeef' }
    }
  })

  nock('https://api.github.com')
    .post('/installations/123/access_tokens')
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .reply(200, {})
    .post('/repos/finnp/testrepo/issues', ({ title, body, labels }) => {
      t.ok(title, 'github issue has title')
      t.same(labels, ['customlabel'], 'github issue correct label')
      t.ok(body, 'github issue has body')
      return true
    })
    .reply(201, () => {
      t.pass('issue created')
      return {
        number: 10
      }
    })

  await openIssue({
    installationId: '123',
    repositoryId: '42',
    accountId: '1010',
    owner: 'finnp',
    repo: 'testrepo',
    version: '2.0.0',
    dependency: 'standard',
    dependencyType: 'devDependencies',
    oldVersionResolved: '1.4.0',
    base: 'master',
    head: 'greenkeeper-standard-2.0.0',
    dependencyLink: 'somelink',
    release: 'therelease',
    diffCommits: 'thecommits',
    statuses: []
  })

  const branch = await repositories.get('42:branch:deadbeef')
  t.is(branch.type, 'branch', 'branch type')
  t.is(branch.purpose, 'pin', 'branch purpose pin')
  t.is(branch.sha, 'deadbeef', 'branch sha')
  t.is(branch.head, 'prefix-standard-pin-1.4.0', 'branch head')
  t.is(branch.base, 'master', 'branch master')
  t.is(branch.dependency, 'standard', 'branch dependency')
  t.is(branch.dependencyType, 'devDependencies', 'branch dependencyType')
  t.is(branch.version, '1.4.0', 'branch version')
  t.is(branch.repositoryId, '42', 'branch repositoryId')
  t.is(branch.accountId, '1010', 'branch accountId')
  t.ok(branch.updatedAt, 'branch updatedAt')
  const issue = await repositories.get('42:issue:10')
  t.is(issue.type, 'issue', 'issue type')
  t.is(issue.version, '2.0.0', 'issue version')
  t.is(issue.number, 10, 'issue number')
  t.is(issue.dependency, 'standard', 'issue dependency')
  t.is(issue.state, 'open', 'issue state')
  t.is(issue.repositoryId, '42', 'issue repositoryId')
})

tearDown(async () => {
  const { repositories } = await dbs()

  await Promise.all([
    repositories.remove(await repositories.get('42')),
    repositories.remove(await repositories.get('42:branch:deadbeef')),
    repositories.remove(await repositories.get('42:issue:10'))
  ])
})
