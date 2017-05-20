const _ = require('lodash')
const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()

const dbs = require('../../../../lib/dbs')
const worker = proxyquire(
  '../../../../jobs/github-event/integration_installation_repositories/added',
  {
    '../../../lib/get-token': () => ({ token: 'secure' })
  }
)

test('github-event integration_installation_repositories added', async t => {
  const { repositories } = await dbs()
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token secure' }
  })
    .get('/repos/bar/repo1')
    .reply(200, {
      id: 31,
      full_name: 'bar/repo1',
      private: true,
      fork: false,
      has_issues: true
    })
    .get('/repos/bar/repo2')
    .reply(200, {
      id: 32,
      full_name: 'bar/repo2',
      private: false,
      fork: false,
      has_issues: true
    })
  const newJobs = await worker({
    installation: {
      id: 1,
      account: {
        id: 2
      }
    },
    repositories_added: [
      { id: 31, full_name: 'bar/repo1' },
      { id: 32, full_name: 'bar/repo2' }
    ]
  })

  t.is(newJobs.length, 2)

  const repos = await Promise.all([
    repositories.get('31'),
    repositories.get('32')
  ])

  t.same(_.uniq(_.map(newJobs, 'data.name')), ['create-initial-branch'])

  newJobs.forEach((job, i) => {
    t.is(job.data.accountId, '2', 'accountId')
  })

  const [repo] = repos
  t.is(repo._id, '31')
  t.is(repo.enabled, false)
  t.is(repo.accountId, '2')
  t.is(repo.fullName, 'bar/repo1')
  t.is(repo.private, true)
  t.is(repo.fork, false)
  t.is(repo.hasIssues, true)

  t.end()
})

tearDown(async () => {
  const { repositories } = await dbs()

  await repositories.bulkDocs(
    (await repositories.allDocs({
      keys: ['31', '32']
    })).rows.map(row => ({
      _id: row.id,
      _rev: row.value.rev,
      _deleted: true
    }))
  )
})
