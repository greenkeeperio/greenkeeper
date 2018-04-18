const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

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
    expect.assertions(7)

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

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputTravisYML = `language: node_js
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

      const targetTravisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
node_js:
- 7
- 10
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
      const updatedTravisYML = transforms[0].transform(inputTravisYML)
      transforms[0].created = true
      expect(updatedTravisYML).toEqual(targetTravisYML)
      return '1234abcd'
    })

    const updateNodeJSVersion = require('../../jobs/update-nodejs-version')

    const newJob = await updateNodeJSVersion({
      repositoryFullName: 'finnp/test',
      nodeVersion: 10,
      codeName: 'Dubnium'
    })
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('42:branch:1234abcd')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/update-to-node-10')
    expect(newBranch.travisModified).toBeTruthy()
  })
})
