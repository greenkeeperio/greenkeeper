const _ = require('lodash')
const { test, tearDown } = require('tap')
const nock = require('nock')
const proxyquire = require('proxyquire').noCallThru()

const dbs = require('../../../../lib/dbs')
const worker = proxyquire(
  '../../../../jobs/github-event/integration_installation/created',
  {
    '../../../lib/get-token': () => ({ token: 'secure' })
  }
)

test('github-event integration_installation created', async t => {
  const { installations, repositories } = await dbs()
  nock('https://api.github.com', {
    reqheaders: { Authorization: 'token secure' }
  })
    .get('/installation/repositories')
    .reply('200', {
      repositories: [
        {
          id: 123,
          full_name: 'bar/repo',
          private: true
        },
        {
          id: 234,
          full_name: 'bar/repo2',
          private: false
        }
      ]
    })

  const newJobs = await worker({
    installation: {
      id: 1,
      account: {
        id: 2,
        login: 'bar',
        type: 'baz'
      },
      repositories_url: 'https://api.github.com/installation/repositories'
    }
  })

  t.is(newJobs.length, 2)

  const repos = await Promise.all([
    repositories.get('123'),
    repositories.get('234')
  ])

  t.same(_.uniq(_.map(newJobs, 'data.name')), ['create-initial-branch'])

  newJobs.forEach((job, i) => {
    t.is(job.data.repositoryId, repos[i]._id)
  })

  newJobs.forEach((job, i) => {
    t.is(job.data.accountId, '2')
  })

  const [repo] = repos
  t.is(repo._id, '123')
  t.is(repo.enabled, false)
  t.is(repo.accountId, '2')
  t.is(repo.fullName, 'bar/repo')
  t.is(repo.private, true)

  const doc = await installations.get('2')

  t.is(doc.installation, 1)
  t.is(doc.login, 'bar')
  t.is(doc.type, 'baz')
  t.end()
})

tearDown(async () => {
  const { installations, repositories } = await dbs()

  await repositories.bulkDocs(
    (await repositories.allDocs({
      keys: ['123', '234']
    })).rows.map(row => ({
      _id: row.id,
      _rev: row.value.rev,
      _deleted: true
    }))
  )
  await installations.remove(await installations.get('2'))
  require('../../../../lib/statsd').close()
})
