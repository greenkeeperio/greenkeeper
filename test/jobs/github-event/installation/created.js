const nock = require('nock')
const _ = require('lodash')

const dbs = require('../../../../lib/dbs')
const removeIfExists = require('../../../helpers/remove-if-exists')
const createInstallation = require('../../../../jobs/github-event/installation/created')

afterAll(async () => {
  const { installations, repositories } = await dbs()

  await Promise.all([
    removeIfExists(installations, '2'),
    removeIfExists(repositories, '123', '234')
  ])
  require('../../../../lib/statsd').close()
})

test('github-event installation created', async () => {
  const { installations, repositories } = await dbs()
  nock('https://api.github.com')
    .post('/app/installations/1/access_tokens')
    .optionally()
    .reply(200, {
      token: 'secret'
    })
    .get('/rate_limit')
    .optionally()
    .reply(200, {})
    .get('/installation/repositories?per_page=100')
    .reply('200', {
      repositories: [
        {
          id: 123,
          full_name: 'bar/repo',
          private: true
        }
      ] }, {
      Link: '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"'
    })
    .get('/installation/repositories?per_page=100&page=2')
    .reply('200', {
      repositories: [
        {
          id: 234,
          full_name: 'bar/repo2',
          private: false
        }
      ] })

  const newJobs = await createInstallation({
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

  expect(newJobs).toHaveLength(2)

  const repos = await Promise.all([
    repositories.get('123'),
    repositories.get('234')
  ])

  expect(_.uniq(_.map(newJobs, 'data.name'))).toContain('create-initial-branch')

  newJobs.forEach((job, i) => {
    expect(job.data.repositoryId).toEqual(repos[i]._id)
    expect(job.data.accountId).toEqual('2')
  })

  const [repo] = repos
  expect(repo._id).toEqual('123')
  expect(repo.enabled).toBeFalsy()
  expect(repo.accountId).toEqual('2')
  expect(repo.fullName).toEqual('bar/repo')
  expect(repo.private).toBeTruthy()

  const doc = await installations.get('2')
  expect(doc.installation).toBe(1)
  expect(doc.login).toBe('bar')
  expect(doc.type).toBe('baz')
})
