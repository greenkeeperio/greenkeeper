const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

function encodePkg (pkg) {
  return Buffer.from(JSON.stringify(pkg)).toString('base64')
}

describe('update nodejs version', () => {
  beforeAll(() => {
    jest.setTimeout(10000)
  })

  beforeEach(() => {
    jest.resetModules()
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123'),
      removeIfExists(repositories, '42', '42:branch:1234abcd')
    ])
  })

  test('update version in travis.yml', async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '123',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: '42',
      accountId: '123',
      fullName: 'finnp/test',
      enabled: true,
      type: 'repository'
    })
    // expect.assertions(10)

    const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
node_js:
- 7
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy

# Trigger a push build on master and greenkeeper branches + PRs build on every branches
# Avoid double build on PRs (See https://github.com/travis-ci/travis-ci/issues/1147)
branches:
  only:
    - master
    - /^greenkeeper.*$/`

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/finnp/test/contents/.travis.yml?ref=master')
      .reply(200, {
        path: '.travis.yml',
        name: '.travis.yml',
        content: Buffer.from(travisYML).toString('base64')
      })
      .log(console.log)

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      //  The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
      const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
node_js:
- 7
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy

# Trigger a push build on master and greenkeeper branches + PRs build on every branches
# Avoid double build on PRs (See https://github.com/travis-ci/travis-ci/issues/1147)
branches:
  only:
    - master
    - /^greenkeeper.*$/`
      console.log('transforms in test', transforms)
      const updatedTravisYML = transforms[0].transform(travisYML)
      console.log('updatedTravisYML', updatedTravisYML)
      return '1234abcd'
    })

    const updateNodeJSVersion = require('../../jobs/update-nodejs-version')

    const newJob = await updateNodeJSVersion({
      repositoryFullName: 'finnp/test',
      nodeVersion: 10,
      codeName: 'Dubnium'
    })
    // const newBranch = await repositories.get('42:branch:1234abcd')

    console.log('newJob', newJob)

    expect(newJob).toBeTruthy()
    // expect(newJob.data.name).toEqual('update-nodejs-version')
    // expect(newJob.data.repositoryId).toBe(42)
    // expect(newJob.delay).toBeGreaterThan(10000)
    // expect(newBranch.type).toEqual('branch')
    // expect(newBranch.initial).toBeTruthy()
    // expect(newBranch.badgeUrl).toEqual('https://badges.greenkeeper.io/finnp/test.svg')
  })
})
