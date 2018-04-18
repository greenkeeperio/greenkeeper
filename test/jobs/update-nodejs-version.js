const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('update nodejs version in .travis.yml only', () => {
  beforeAll(() => {
    jest.setTimeout(10000)
  })

  beforeEach(() => {
    jest.resetModules()
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123', '1234', '12345'),
      removeIfExists(repositories, '42', '42:branch:1234abcd', '42:issue:10', '55', '55:branch:1234abcd', '555')
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
      type: 'repository',
      packages: {
        'package.json': {
          engines: {
            node: 'v8.10'
          }
        },
        'frontend/package.json': {
          engines: {
            node: '>9'
          }
        },
        'backend/package.json': {
          engines: {
            node: '>=7 <9.1'
          }
        }
      }
    })
    expect.assertions(25)

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
      .post('/repos/finnp/test/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
        expect(body).toMatch('Version 10 of node.js (code name Dubnium) has been released!')
        expect(body).toMatch('- Added the new version to your `.travis.yml`')
        expect(body).toMatch('"/finnp/test/compare/master...finnp:greenkeeper%2Fupdate-to-node-10"')
        expect(body).toMatch('- The engines config in 1 of your `package.json` files was updated to the new node version')
        expect(body).toMatch('- The new node version is in-range for the engines in 1 of your `package.json` files, so that was left alone')
        expect(body).toMatch('- The engines config in 1 of your `package.json` files was too ambiguous to be updated automatically')
        expect(labels).toHaveLength(1)
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

      const packageJSON = JSON.stringify({
        engines: {
          node: 'v8.10'
        }
      })
      const frontendPackageJSON = JSON.stringify({
        engines: {
          node: '>9'
        }
      })
      const backendPackageJSON = JSON.stringify({
        engines: {
          node: '>=7 <9.1'
        }
      })

      const updatedTravisYML = transforms[0].transform(inputTravisYML)
      transforms[0].created = true
      expect(updatedTravisYML).toEqual(targetTravisYML)
      const updatedEngines = transforms[1].transform(packageJSON)
      const updatedFrontendEngines = transforms[2].transform(frontendPackageJSON)
      const updatedBackendEngines = transforms[3].transform(backendPackageJSON)
      expect(JSON.parse(updatedEngines)).toEqual({engines: {node: '10'}})
      expect(updatedFrontendEngines).toBeFalsy()
      expect(updatedBackendEngines).toBeFalsy()
      return '1234abcd'
    })

    const updateNodeJSVersion = require('../../jobs/update-nodejs-version')

    const newJob = await updateNodeJSVersion({
      repositoryFullName: 'finnp/test',
      nodeVersion: '10',
      codeName: 'Dubnium'
    })
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('42:branch:1234abcd')
    const newIssue = await repositories.get('42:issue:10')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/update-to-node-10')
    expect(newBranch.travisModified).toBeTruthy()
    expect(newIssue.type).toEqual('issue')
    expect(newIssue.repositoryId).toEqual('42')
    expect(newIssue.number).toEqual(10)
    expect(newIssue.state).toEqual('open')
  })

  test('update version in nvmrc', async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '1234',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: '55',
      accountId: '1234',
      fullName: 'anna/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(8)

    const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
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

    const nvmrc = '8.13'

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/anna/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/anna/test/contents/.travis.yml?ref=master')
      .reply(200, {
        path: '.travis.yml',
        name: '.travis.yml',
        content: Buffer.from(travisYML).toString('base64')
      })
      .get('/repos/anna/test/contents/.nvmrc?ref=master')
      .reply(200, {
        path: '.nvmrc',
        name: '.nvmrc',
        content: Buffer.from(nvmrc).toString('base64')
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputNvmrc = '8.13'
      const targetNvmrc = 10
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      transforms[1].created = true
      expect(updatedNvmrc).toEqual(targetNvmrc)
      return '1234abcd'
    })

    const updateNodeJSVersion = require('../../jobs/update-nodejs-version')

    const newJob = await updateNodeJSVersion({
      repositoryFullName: 'anna/test',
      nodeVersion: 10,
      codeName: 'Dubnium'
    })
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('55:branch:1234abcd')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/update-to-node-10')
    expect(newBranch.travisModified).toBeFalsy()
    expect(newBranch.nvmrcModified).toBeTruthy()
  })

  test('do not update version in nvmrc when it is already the latest', async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '12345',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: '555',
      accountId: '12345',
      fullName: 'birne/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(3)

    const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
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

    const nvmrc = 'lts/*'

    nock('https://api.github.com')
      .post('/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/birne/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/birne/test/contents/.travis.yml?ref=master')
      .reply(200, {
        path: '.travis.yml',
        name: '.travis.yml',
        content: Buffer.from(travisYML).toString('base64')
      })
      .get('/repos/birne/test/contents/.nvmrc?ref=master')
      .reply(200, {
        path: '.nvmrc',
        name: '.nvmrc',
        content: Buffer.from(nvmrc).toString('base64')
      })

    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputNvmrc = 'lts/*'
      const targetNvmrc = 10
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      expect(updatedNvmrc).not.toEqual(targetNvmrc)
      expect(updatedNvmrc).toEqual(inputNvmrc)
      return null
    })
    const updateNodeJSVersion = require('../../jobs/update-nodejs-version')

    const newJob = await updateNodeJSVersion({
      repositoryFullName: 'birne/test',
      nodeVersion: 10,
      codeName: 'Dubnium'
    })
    expect(newJob).toBeFalsy()
  })
})
