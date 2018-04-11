const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('create-initial-subgroup-pr', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.setTimeout(20000)
  })

  test('create subgroup initial pr for monorepo', async () => {
    const createInitial = require('../../jobs/create-initial-subgroup-pr')
    const { repositories } = await dbs()

    await repositories.put({
      _id: 'mono',
      accountId: '123',
      fullName: 'petra/monorepo'
    })

    await repositories.put({
      _id: 'mono:branch:monorepo1',
      type: 'branch',
      initial: false,
      subgroupInitial: true,
      sha: 'monorepo1',
      base: 'master',
      head: 'greenkeeper/initial-frontend',
      processed: false,
      depsUpdated: true,
      badgeUrl: 'https://badges.greenkeeper.io/petra/monorepo.svg',
      createdAt: '2017-01-13T17:33:56.698Z',
      updatedAt: '2017-01-13T17:33:56.698Z'
    })

    expect.assertions(8)

    nock('https://api.github.com')
      .post('/installations/11/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/petra/monorepo')
      .reply(200, {
        default_branch: 'custom'
      })
      .post('/repos/petra/monorepo/statuses/monorepo1')
      .reply(201, () => {
        // verify status added
        expect(true).toBeTruthy()
        return {}
      })
      .post(
        '/repos/petra/monorepo/pulls',
        ({ head }) => head === 'greenkeeper/initial-frontend'
      )
      .reply(201, (uri, requestBody) => {
        // pull request created
        expect(true).toBeTruthy()
        const body = JSON.parse(requestBody).body
        expect(body).toMatch('This pull request **updates all your dependencies in the group `frontend` to their latest version**')
        expect(body).toMatch('How to ignore certain dependencies for this group')
        expect(body).not.toMatch('**Important: Greenkeeper will only start watching this repository’s dependency updates after you merge this initial pull request**.')
        expect(body).not.toMatch('greenkeeper.ignore')
        expect(body).not.toMatch('but only after **you merge this pull request**.')
        return {
          id: 333,
          number: 3
        }
      })
      .post(
        '/repos/petra/monorepo/issues/3/labels',
        body => body[0] === 'greenkeeper'
      )
      .reply(201, () => {
        // label created
        expect(true).toBeTruthy()
        return {}
      })

    const branchDoc = await repositories.get('mono:branch:monorepo1')
    await createInitial({
      repository: { id: 'mono' },
      branchDoc: branchDoc,
      combined: {
        state: 'success',
        combined: []
      },
      installationId: 11,
      accountId: '123',
      groupName: 'frontend'
    })
  })

  afterAll(async () => {
    const { repositories } = await dbs()

    await Promise.all([
      removeIfExists(repositories, 'mono', 'mono:branch:monorepo1')
    ])
  })
})
