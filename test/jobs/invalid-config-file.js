const nock = require('nock')
const _ = require('lodash')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

const invalidConfigFile = require('../../jobs/invalid-config-file')

describe('invalid-config-file', async () => {
  beforeAll(async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '2020',
      installation: 37
    })
    await repositories.put({
      _id: 'invalid-config1',
      fullName: 'lisa/monorepo'
    })
    await repositories.put({
      _id: 'invalid-config4',
      fullName: 'lisa/monorepo'
    })
  })

  afterAll(async () => {
    const { repositories, installations } = await dbs()
    await Promise.all([
      removeIfExists(installations, '2020', '2121'),
      removeIfExists(repositories, 'invalid-config1', 'invalid-config1:issue:10',
        'invalid-config2', 'invalid-config2:issue:10',
        'invalid-config3', 'invalid-config3:issue:10', 'invalid-config3:issue:11', 'invalid-config4:issue:11')
    ])
  })

  test('create new issue', async () => {
    expect.assertions(12)
    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/lisa/monorepo/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
        expect(body).toMatch(/We found the following issue:/)
        expect(body).toMatch(/1. The group name `#invalid#groupname#` is invalid./)
        expect(labels).toContain('greenkeeper')
        return true
      })
      .reply(201, () => {
        // issue created
        expect(true).toBeTruthy()
        return {
          number: 10
        }
      })

    const newJobs = await invalidConfigFile({
      repositoryId: 'invalid-config1',
      accountId: '2020',
      messages: ['The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).']
    })
    expect(newJobs).toBeFalsy()

    const { repositories } = await dbs()
    const issue = await repositories.get('invalid-config1:issue:10')
    expect(issue.initial).toBeFalsy()
    expect(issue.invalidConfig).toBeTruthy()
    expect(issue.type).toEqual('issue')
    expect(issue.number).toBe(10)
    expect(issue.repositoryId).toBe('invalid-config1')
    githubMock.done()
  })

  test('an open issue already exists', async () => {
    nock('https://api.github.com') // no request should be made
    expect.assertions(2)

    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '2121',
      installation: 38
    })
    await repositories.put({
      _id: 'invalid-config2',
      fullName: 'lisa/monorepo'
    })
    await repositories.put({
      _id: 'invalid-config2:issue:10',
      type: 'issue',
      initial: false,
      invalidConfig: true,
      repositoryId: 'invalid-config2',
      number: 10,
      state: 'open'
    })

    const newJobs = await invalidConfigFile({
      repositoryId: 'invalid-config2',
      accountId: 2121
    })

    expect(newJobs).toBeFalsy()

    const openIssues = _.get(
      await repositories.query('open_invalid_config_issue', {
        key: 'invalid-config2',
        include_docs: true
      }),
      'rows'
    )

    expect(openIssues).toHaveLength(1)
  })

  test('a closed issue already exists', async () => {
    expect.assertions(10)

    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '2222',
      installation: 39
    })
    await repositories.put({
      _id: 'invalid-config3',
      fullName: 'lisa/monorepo'
    })
    await repositories.put({
      _id: 'invalid-config3:issue:10',
      type: 'issue',
      initial: false,
      invalidConfig: true,
      repositoryId: 'invalid-config3',
      number: 10,
      state: 'closed'
    })

    nock('https://api.github.com')
      .post('/app/installations/39/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/lisa/monorepo/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
        expect(body).toMatch(/We found the following issues:/)
        expect(body).toMatch(/1. The root-level key `frontend` is invalid./)
        expect(body).toMatch(/2. The root-level key `backend` is invalid./)
        expect(labels).toContain('greenkeeper')
        return true
      })
      .reply(201, () => {
        // issue created
        expect(true).toBeTruthy()
        return {
          number: 11
        }
      })

    const newJobs = await invalidConfigFile({
      repositoryId: 'invalid-config3',
      accountId: 2222,
      messages: ['The root-level key `frontend` is invalid. If you meant to add a group named `frontend`, please put it in a root-level `groups` object. Valid root-level keys are `groups` and `ignore`.', 'The root-level key `backend` is invalid. If you meant to add a group named `backend`, please put it in a root-level `groups` object. Valid root-level keys are `groups` and `ignore`.']
    })

    expect(newJobs).toBeFalsy()

    const openIssues = _.get(
      await repositories.query('open_invalid_config_issue', {
        key: 'invalid-config3',
        include_docs: true
      }),
      'rows'
    )

    expect(openIssues).toHaveLength(1)
    expect(openIssues[0].doc._id).toEqual('invalid-config3:issue:11')
  })

  test('create new issue with reference to delayed initial PR', async () => {
    expect.assertions(14)
    const githubMock = nock('https://api.github.com')
      .post('/app/installations/37/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .post('/repos/lisa/monorepo/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
        expect(body).toMatch(/We found the following issue:/)
        expect(body).toMatch(/1. The group name `#invalid#groupname#` is invalid./)
        expect(body).toMatch(/which is preventing Greenkeeper from opening its initial pull request/)
        expect(body).toMatch(/so Greenkeeper can run on this repository/)
        expect(labels).toContain('greenkeeper')
        return true
      })
      .reply(201, () => {
        // issue created
        expect(true).toBeTruthy()
        return {
          number: 11
        }
      })

    const newJobs = await invalidConfigFile({
      repositoryId: 'invalid-config4',
      accountId: '2020',
      messages: ['The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).'],
      isBlockingInitialPR: true
    })
    expect(newJobs).toBeFalsy()

    const { repositories } = await dbs()
    const issue = await repositories.get('invalid-config4:issue:11')
    expect(issue.initial).toBeFalsy()
    expect(issue.invalidConfig).toBeTruthy()
    expect(issue.type).toEqual('issue')
    expect(issue.number).toBe(11)
    expect(issue.repositoryId).toBe('invalid-config4')
    githubMock.done()
  })
})
