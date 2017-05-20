const { test, tearDown } = require('tap')
const proxyquire = require('proxyquire')
const nock = require('nock')
const GitHub = require('../../lib/github')

const dbs = require('../../lib/dbs')

test('handle-branch-status', async t => {
  const { repositories, installations, npm } = await dbs()

  const github = GitHub()
  github.authenticate({ type: 'token', token: 'secure' })

  t.test('without issue', async t => {
    await Promise.all([
      installations.put({
        _id: '10',
        installation: '1337'
      }),
      npm.put({
        _id: 'test',
        versions: {}
      }),
      npm.put({
        _id: 'test2',
        versions: {}
      }),
      repositories.put({
        _id: '42:branch:deadbeef',
        type: 'branch',
        sha: 'deadbeef',
        head: 'branchname',
        dependency: 'test',
        version: '1.0.1'
      }),
      repositories.put({
        _id: '42:branch:deadbeef2',
        type: 'branch',
        sha: 'deadbeef2',
        head: 'branchname2',
        dependency: 'test2',
        version: '1.0.2'
      })
    ])

    t.test('success', async t => {
      const handleBranchStatus = proxyquire('../../lib/handle-branch-status', {
        './open-issue': data => {
          t.pass('opened an issue')
        }
      })

      nock('https://api.github.com')
        .delete('/repos/club/mate/git/refs/heads/branchname')
        .reply(422, () => {
          t.pass('deleted branch')
          // simulate reference already been deleted
          return {
            message: 'Reference does not exist'
          }
        })

      const newJob = await handleBranchStatus({
        github,
        accountId: '10',
        repository: {
          id: '42',
          full_name: 'club/mate'
        },
        branchDoc: await repositories.get('42:branch:deadbeef'),
        combined: {
          state: 'success',
          combined: []
        }
      })

      t.notOk(newJob, 'no new job scheduled')
      const branch = await repositories.get('42:branch:deadbeef')
      t.ok(branch.processed, 'branch is processed')
      t.ok(branch.referenceDeleted, 'referenceDeleted')
      t.same(branch.state, 'success', 'status is success')
    })

    t.test('failure', async t => {
      t.plan(4)
      const handleBranchStatus = proxyquire('../../lib/handle-branch-status', {
        './open-issue': data => {
          t.pass('opened an issue')
        }
      })

      nock('https://api.github.com')

      const newJob = await handleBranchStatus({
        github,
        accountId: 42,
        combined: { state: 'failure', statuses: [] },
        branchDoc: await repositories.get('42:branch:deadbeef2'),
        repository: {
          id: 42,
          full_name: 'club/mate',
          owner: {
            id: 10
          }
        }
      })

      t.notOk(newJob, 'does not schedule new job')
      const branch = await repositories.get('42:branch:deadbeef2')
      t.ok(branch.processed, 'branch is processed')
      t.same(branch.state, 'failure', 'status is failure')
    })
  })

  t.test('with issue', async t => {
    const handleBranchStatus = require('../../lib/handle-branch-status')
    t.plan(5)
    await Promise.all([
      repositories.put({
        _id: '43:issue:5',
        type: 'issue',
        state: 'open',
        dependency: 'test3',
        repositoryId: '43',
        number: 5
      }),
      npm.put({
        _id: 'test3',
        versions: {}
      }),
      repositories.put({
        _id: '43:branch:deadbeef3',
        type: 'branch',
        sha: 'deadbeef3',
        head: 'branchname3',
        dependency: 'test3',
        version: '1.0.1'
      })
    ])

    nock('https://api.github.com')
      .post('/repos/club/mate/issues/5/comments')
      .reply(201, () => {
        t.pass('commented on right issue')
      })

    const newJob = await handleBranchStatus({
      github,
      accountId: 43,
      combined: { state: 'success', statuses: [] },
      branchDoc: await repositories.get('43:branch:deadbeef3'),
      repository: {
        id: 43,
        full_name: 'club/mate',
        owner: {
          id: 10
        }
      }
    })
    t.notOk(newJob, 'no new job scheduled')
    const branch = await repositories.get('43:branch:deadbeef3')
    t.ok(branch.processed, 'branch is processed')
    t.notOk(branch.referenceDeleted, 'referenceDeleted')
    t.same(branch.state, 'success', 'status is success')
  })
})

tearDown(async () => {
  const { repositories, installations, npm } = await dbs()
  await Promise.all([
    repositories.remove(await repositories.get('42:branch:deadbeef')),
    repositories.remove(await repositories.get('42:branch:deadbeef2')),
    repositories.remove(await repositories.get('43:branch:deadbeef3')),
    repositories.remove(await repositories.get('43:issue:5')),
    installations.remove(await installations.get('10')),
    npm.remove(await npm.get('test')),
    npm.remove(await npm.get('test2'))
  ])
})
