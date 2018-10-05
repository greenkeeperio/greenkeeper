const nock = require('nock')

const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

describe('deprecate and update nodejs version', () => {
  beforeAll(async () => {
    const { installations } = await dbs()
    await installations.put({
      _id: '1234',
      installation: 137,
      plan: 'free'
    })
  })

  beforeEach(() => {
    jest.resetModules()
  })

  afterAll(async () => {
    const { installations, repositories } = await dbs()
    await Promise.all([
      removeIfExists(installations, '123', '1234', '12345', '321', '777'),
      removeIfExists(repositories, '42', '42:branch:1234abcd', '42:issue:10', '55', '55:branch:1234abcd', '56', '56:branch:1234abcd', 'node-update-555', 'node-update-333', 'node-deprecation-777', 'node-deprecation-777:branch:1234abcd', '4200', '4200:branch:1234abcd', '4200:issue:10', '999666', '999666:branch:1234abcd')
    ])
  })

  test('remove 4 and add 6 in travis.yml and engines', async () => {
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
            node: 'v4'
          }
        },
        'frontend/package.json': {
          engines: {
            node: '>4'
          }
        },
        'backend/package.json': {
          engines: {
            node: '>=7 <9.1'
          }
        }
      }
    })
    expect.assertions(26)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
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
      .post('/repos/finnp/test/issues', ({ title, body, labels }) => {
        expect(title).toBeTruthy()
        expect(body).toBeTruthy()
        expect(body).toMatch('Version 4 of Node.js (code name Argon) has been deprecated!')
        expect(body).toMatch('Version 6 (Boron) is now the lowest actively maintained Node.js version.')
        expect(body).toMatch('- Upgraded away from the deprecated version in your `.travis.yml`')
        expect(body).toMatch('The engines config in 2 of your `package.json` files was updated to the new lowest actively supported Node.js versio')
        expect(body).toMatch('"https://github.com/finnp/test/compare/master...finnp:greenkeeper%2Fdeprecate-node-4"')
        // We didn’t pass in an announcementURL, so that shouldn’t be there
        expect(body).not.toMatch('You can find out more about the deprecation and possible update strategies')
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
- 4
- 5
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`

      const targetTravisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
node_js:
- 5
- 6
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`

      const packageJSON = JSON.stringify({
        engines: {
          node: 'v4'
        }
      })
      const frontendPackageJSON = JSON.stringify({
        engines: {
          node: '>4'
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
      const updatedEngines = transforms[2].transform(packageJSON)
      const updatedFrontendEngines = transforms[3].transform(frontendPackageJSON)
      const updatedBackendEngines = transforms[4].transform(backendPackageJSON)
      expect(JSON.parse(updatedEngines)).toEqual({ engines: { node: 'v6' } })
      expect(JSON.parse(updatedFrontendEngines)).toEqual({ engines: { node: '>6' } })
      expect(updatedBackendEngines).toBeFalsy()
      return '1234abcd'
    })

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'finnp/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })
    ghNock.done()
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('42:branch:1234abcd')
    const newIssue = await repositories.get('42:issue:10')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/deprecate-node-4')
    expect(newBranch.travisModified).toBeTruthy()
    expect(newBranch.nvmrcModified).toBeFalsy()
    expect(newIssue.type).toEqual('issue')
    expect(newIssue.repositoryId).toEqual('42')
    expect(newIssue.number).toEqual(10)
    expect(newIssue.state).toEqual('open')
  })

  test('update version in nvmrc', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '55',
      accountId: '1234',
      fullName: 'anna/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(9)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
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
      .post('/repos/anna/test/issues')
      .reply(201, () => {
        // issue created
        expect(true).toBeTruthy()
        return {
          number: 10
        }
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputNvmrc = '4.12.1'
      const targetNvmrc = '6\n'
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      transforms[1].created = true
      expect(updatedNvmrc).toEqual(targetNvmrc)
      return '1234abcd'
    })

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'anna/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })
    ghNock.done()
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('55:branch:1234abcd')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/deprecate-node-4')
    expect(newBranch.travisModified).toBeFalsy()
    expect(newBranch.nvmrcModified).toBeTruthy()
  })

  test('show announcementURL if passed in', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '56',
      accountId: '1234',
      fullName: 'horst/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(11)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/horst/test')
      .reply(200, {
        default_branch: 'master'
      })
      .post('/repos/horst/test/issues', ({ title, body, labels }) => {
        expect(body).toBeTruthy()
        expect(body).toMatch('You can find out more about the deprecation and possible update strategies [in this Node.js foundation announcement](https://medium.com/the-node-js-collection/april-2018-release-updates-from-the-node-js-project-71687e1f7742)')
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
      const inputNvmrc = '4.12.1'
      const targetNvmrc = '6\n'
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      transforms[1].created = true
      expect(updatedNvmrc).toEqual(targetNvmrc)
      return '1234abcd'
    })

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'horst/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron',
      announcementURL: 'https://medium.com/the-node-js-collection/april-2018-release-updates-from-the-node-js-project-71687e1f7742'
    })
    ghNock.done()
    expect(newJob).toBeFalsy()

    const newBranch = await repositories.get('56:branch:1234abcd')

    expect(newBranch.type).toEqual('branch')
    expect(newBranch.initial).toBeFalsy()
    expect(newBranch.base).toEqual('master')
    expect(newBranch.head).toEqual('greenkeeper/deprecate-node-4')
    expect(newBranch.travisModified).toBeFalsy()
    expect(newBranch.nvmrcModified).toBeTruthy()
  })

  test('do not update version in nvmrc when it is not deprecatable', async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '12345',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: 'node-update-555',
      accountId: '12345',
      fullName: 'birne/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(3)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
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

    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputNvmrc = 'lts/*'
      const targetNvmrc = '6'
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      expect(updatedNvmrc).not.toEqual(targetNvmrc)
      expect(updatedNvmrc).toEqual(inputNvmrc)
      return null
    })
    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'birne/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })

    ghNock.done()
    expect(newJob).toBeFalsy()
  })

  test('do nothing if there is nothing to change', async () => {
    const { repositories, installations } = await dbs()
    await installations.put({
      _id: '321',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: 'node-update-333',
      accountId: '321',
      fullName: 'apfel/test',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(1)

    const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy
branches:
  only:
    - master
    - /^greenkeeper.*$/`

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/apfel/test')
      .reply(200, {
        default_branch: 'master'
      })
      .get('/repos/apfel/test/contents/.travis.yml?ref=master')
      .reply(200, {
        path: '.travis.yml',
        name: '.travis.yml',
        content: Buffer.from(travisYML).toString('base64')
      })
      .get('/repos/apfel/test/contents/.nvmrc?ref=master')
      .reply(404)

    // don't mock createBranch ... not sure how else to do it. jest.dontMock() didn't work
    jest.mock('../../lib/create-branch', () => {
      const createBranch = require.requireActual('../../lib/create-branch')
      return createBranch
    })
    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'apfel/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })

    ghNock.done()
    expect(newJob).toBeFalsy()
  })

  test('do nothing if there is already a branch for this update', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: 'node-deprecation-777',
      accountId: '321',
      fullName: 'garnix/test',
      enabled: true,
      type: 'repository'
    })
    await repositories.put({
      _id: 'node-deprecation-777:branch:1234abcd',
      type: 'branch',
      initial: false,
      sha: '1234abcd',
      base: 'master',
      head: 'greenkeeper/deprecation-of-node-4',
      processed: false,
      travisModified: true,
      engineTransformMessages: { updated: 1 },
      repositoryId: 'node-deprecation-777',
      dependency: 'node-4',
      dependencyType: 'node-deprecation'
    })
    expect.assertions(1)

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'garnix/test',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })

    expect(newJob).toBeFalsy()
  })

  test('package.json has no engines', async () => {
    const { installations, repositories } = await dbs()
    await installations.put({
      _id: '777',
      installation: 137,
      plan: 'free'
    })
    await repositories.put({
      _id: '4200',
      accountId: '777',
      fullName: 'finnp/horst',
      enabled: true,
      type: 'repository',
      packages: {
        'package.json': {
        }
      }
    })
    expect.assertions(4)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/finnp/horst')
      .reply(200, {
        default_branch: 'master'
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const packageJSON = JSON.stringify({ name: 'uhu' })
      const updatedEngines = transforms[2].transform(packageJSON)
      expect(updatedEngines).toBeFalsy()
    })

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'finnp/horst',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })
    ghNock.done()
    expect(newJob).toBeFalsy()

    // Neither of these should exist
    try {
      await repositories.get('4200:branch:1234abcd')
    } catch (e) {
      expect(e.error).toEqual('not_found')
    }
    try {
      await repositories.get('4200:issue:10')
    } catch (e) {
      expect(e.error).toEqual('not_found')
    }
  })

  test('don’t update to 4 from v9 in nvmrc', async () => {
    const { repositories } = await dbs()
    await repositories.put({
      _id: '999666',
      accountId: '1234',
      fullName: 'anna/nines',
      enabled: true,
      type: 'repository'
    })
    expect.assertions(3)

    const ghNock = nock('https://api.github.com')
      .post('/app/installations/137/access_tokens')
      .optionally()
      .reply(200, {
        token: 'secret'
      })
      .get('/rate_limit')
      .optionally()
      .reply(200, {})
      .get('/repos/anna/nines')
      .reply(200, {
        default_branch: 'master'
      })

    // mock relative dependencies
    jest.mock('../../lib/create-branch', () => ({ transforms }) => {
      const inputNvmrc = 'v9'
      const targetNvmrc = 'v9'
      const updatedNvmrc = transforms[1].transform(inputNvmrc)
      transforms[1].created = false
      expect(updatedNvmrc).toEqual(targetNvmrc)
    })

    const deprecateNodeJSVersion = require('../../jobs/deprecate-nodejs-version')

    const newJob = await deprecateNodeJSVersion({
      repositoryFullName: 'anna/nines',
      nodeVersion: '4',
      codeName: 'Argon',
      newLowestVersion: 6,
      newLowestCodeName: 'Boron'
    })
    ghNock.done()
    expect(newJob).toBeFalsy()

    try {
      await repositories.get('999666:branch:1234abcd')
    } catch (e) {
      expect(e.error).toEqual('not_found')
    }
  })
})
