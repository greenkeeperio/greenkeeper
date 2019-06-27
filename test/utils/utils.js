const nock = require('nock')

const {
  seperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved,
  getNodeVersionsFromTravisYML,
  addNodeVersionToTravisYML,
  addNewLowestAndDeprecate,
  hasNodeVersion,
  getLockfilePath,
  getLicenseAndPublisherFromVersions
} = require('../../utils/utils')

const { cleanCache } = require('../helpers/module-cache-helpers')
nock.disableNetConnect()

beforeEach(() => {
  delete process.env.GITHUB_URL
  cleanCache('../../lib/env')
  jest.resetModules()
})

afterAll(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

test('seperateNormalAndMonorepos', () => {
  const input = [
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: '456-monorepo',
      key: 'react',
      value: {
        fullName: 'lily/monorepo',
        accountId: '123-two-packages',
        filename: 'packages/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: '775',
      key: 'eslint',
      value: {
        fullName: 'owner/repo3',
        accountId: '999',
        filename: 'package.json',
        type: 'devDependencies',
        oldVersion: '1.0.0' } },
    { id: '775',
      key: 'eslint',
      value: {
        fullName: 'owner/repo3',
        accountId: '999',
        filename: 'package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: '776',
      key: 'eslint',
      value: {
        fullName: 'owner/repo2',
        accountId: '999',
        filename: 'package.json',
        type: 'peerDependencies',
        oldVersion: '1.0.0' } }
  ]

  const output = seperateNormalAndMonorepos(input)
  // seperates Monorepos from normal repos
  expect(output).toHaveLength(2)
  // finds 2 Monorepos, two with two package.jsons and one with one
  expect(output[0]).toHaveLength(2)
  expect(output[0][0]).toHaveLength(2)
  expect(output[0][1]).toHaveLength(1)
  // finds 2 Normal repos where one has a doubled dependency
  expect(output[1]).toHaveLength(2)
  expect(output[1][0]).toHaveLength(2)
  expect(output[1][1]).toHaveLength(1)
})

test('getJobsPerGroup', () => {
  const monorepo = [
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } }
  ]

  const config = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    groups: {
      default: {
        packages:
        ['package.json', 'backend/package.json']
      }
    }
  }

  const config2 = {
    label: 'greenkeeper',
    branchPrefix: 'greenkeeper/',
    ignore: [],
    groups: {
      main: {
        packages:
        ['package.json']
      },
      backend: {
        packages:
        ['backend/package.json']
      }
    }
  }
  const distTags = { latest: '10.0.0' }
  const distTag = 'latest'
  const dependency = 'react'
  const versions = {
    '10.0.0': { gitHead: 'b75aeb5' },
    '1.1.0': { gitHead: 'b75aeb4' },
    '1.0.0': { gitHead: 'b75aeb3' }
  }
  const account = { installation: 123 }
  const repositoryId = '123-monorepo'
  const plan = {}

  // creates one job if all package.json files are in the same group
  expect(getJobsPerGroup({
    config,
    monorepo,
    distTag,
    distTags,
    dependency,
    versions,
    account,
    repositoryId,
    plan,
    logs: console.log
  })).toHaveLength(1)
  // creates two jobs if all package.json files are in two groups
  expect(getJobsPerGroup({
    config: config2,
    monorepo,
    distTag,
    distTags,
    dependency,
    versions,
    account,
    repositoryId,
    plan })).toHaveLength(2)
})

test('filterAndSortPackages', () => {
  const packages = [
    { id: 'devDependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'devDependencies',
        oldVersion: '1.0.0' } },
    { id: 'optionalDependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'optionalDependencies',
        oldVersion: '1.0.0' } },
    { id: 'dependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' } },
    { id: 'peerDependencies',
      key: 'react',
      value: {
        fullName: 'owner/repo2',
        accountId: '999',
        filename: 'package.json',
        type: 'peerDependencies',
        oldVersion: '1.0.0' } }
  ]

  const output = filterAndSortPackages(packages)
  const outputByType = output.map(p => p.value.type)
  expect(output).toHaveLength(3)
  // throws away peerDependencies
  expect(outputByType).not.toContain('peerDependencies')
  // sorts `dependencies` to the top
  expect(outputByType[0]).toEqual('dependencies')
  // sorts `devDependencies` to the middle
  expect(outputByType[1]).toEqual('devDependencies')
  // sorts `optionalDependencies` to the bottom
  expect(outputByType[2]).toEqual('optionalDependencies')
})

test('getSatisfyingVersions', () => {
  const pkg =
    { id: 'devDependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'devDependencies',
        oldVersion: '^1.0.0' } }

  const versions = {
    '2.0.0': { gitHead: 'b75aeb5' },
    '1.1.0': { gitHead: 'b75aeb4' },
    '1.0.0': { gitHead: 'b75aeb3' }
  }

  const output = getSatisfyingVersions(versions, pkg)
  expect(output).toHaveLength(2)
  // returns all satisfying versions
  expect(output).toContain('1.1.0')
  expect(output).toContain('1.0.0')
})

test('getOldVersionResolved', () => {
  const satisfyingVersions = ['9.3.1', '9.3.0', '9.2.0']
  const distTags = { latest: '10.0.0' }
  const distTag = 'latest'

  const output = getOldVersionResolved(satisfyingVersions, distTags, distTag)
  // returns the last satisfying version
  expect(output).toEqual('9.3.1')
})

test('getLicenseAndPublisherFromVersions', () => {
  const version = '2.2.2'
  const oldVersionResolved = '1.1.1'
  const versions = {
    '1.1.1': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/cat/cat.git'
      },
      'license': 'MIT',
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    },
    '2.2.2': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/best/best.git'
      },
      'license': 'MIT',
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    }
  }
  const output = getLicenseAndPublisherFromVersions({ versions, version, oldVersionResolved })
  expect(output).toMatchObject({ license: 'MIT', licenseHasChanged: false, publisher: 'finn' })
})

test('getLicenseAndPublisherFromVersions with changed license', () => {
  const version = '2.2.2'
  const oldVersionResolved = '1.1.1'
  const versions = {
    '1.1.1': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/cat/cat.git'
      },
      'license': 'MIT',
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    },
    '2.2.2': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/best/best.git'
      },
      'license': 'kitty',
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    }
  }
  const output = getLicenseAndPublisherFromVersions({ versions, version, oldVersionResolved })
  expect(output).toMatchObject({ license: 'kitty', licenseHasChanged: true, publisher: 'finn', previousLicense: 'MIT' })
})

test('getLicenseAndPublisherFromVersions with no previous license', () => {
  const version = '2.2.2'
  const oldVersionResolved = '1.1.1'
  const versions = {
    '1.1.1': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/cat/cat.git'
      },
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    },
    '2.2.2': {
      'repository': {
        'type': 'git',
        'url': 'git+https://github.com/best/best.git'
      },
      'license': 'kitty',
      '_npmUser': {
        name: 'finn',
        email: 'finn.pauls@gmail.com'
      }
    }
  }
  const output = getLicenseAndPublisherFromVersions({ versions, version, oldVersionResolved })
  expect(output).toMatchObject({
    license: 'kitty',
    publisher: 'finn',
    licenseHasChanged: true,
    previousLicense: 'No license' })
})

test('Use default env.GITHUB_URL in github compare URL', () => {
  const fullName = 'hanshansen/mopeds'
  const branch = 'master'
  const compareWith = 'greenkeeper/frontend/standard-10.0.0'
  const { generateGitHubCompareURL } = require('../../utils/utils')
  const url = generateGitHubCompareURL(fullName, branch, compareWith)
  expect(url).toEqual('https://github.com/hanshansen/mopeds/compare/master...hanshansen:greenkeeper%2Ffrontend%2Fstandard-10.0.0')
})

test('respect env.GITHUB_URL in github compare URL', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const fullName = 'hanshansen/mopeds'
  const branch = 'dev'
  const compareWith = 'greenkeeper/frontend/standard-10.0.0'
  const { generateGitHubCompareURL } = require('../../utils/utils')
  const url = generateGitHubCompareURL(fullName, branch, compareWith)
  expect(url).toEqual('https://superprivategit.megacorp.com/hanshansen/mopeds/compare/dev...hanshansen:greenkeeper%2Ffrontend%2Fstandard-10.0.0')
})

test('get no lockfile', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const files = {
    'package.json': ['package.json'],
    'package-lock.json': [],
    'yarn.lock': [],
    'shrinkwrap.json': []
  }
  const packageFileName = 'package.json'
  const path = getLockfilePath(files, packageFileName)
  expect(path).toBeFalsy()
})

test('get lockfile for package-lock', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const files = {
    'package.json': ['package.json'],
    'package-lock.json': ['package-lock.json'],
    'yarn.lock': false,
    'shrinkwrap.json': false
  }
  const packageFileName = 'package.json'
  const path = getLockfilePath(files, packageFileName)
  expect(path).toEqual('package-lock.json')
})

test('get npm lockfile despite yarn.lock', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const files = {
    'package.json': ['package.json'],
    'package-lock.json': ['package-lock.json'],
    'yarn.lock': ['yarn.lock'],
    'shrinkwrap.json': false
  }
  const packageFileName = 'package.json'
  const path = getLockfilePath(files, packageFileName)
  expect(path).toEqual('package-lock.json')
})

test('get yarn.lock', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const files = {
    'package.json': ['package.json'],
    'package-lock.json': [],
    'yarn.lock': ['yarn.lock'],
    'shrinkwrap.json': false
  }
  const packageFileName = 'package.json'
  const path = getLockfilePath(files, packageFileName)
  expect(path).toEqual('yarn.lock')
})

test('get one of many yarn.lock', () => {
  process.env.GITHUB_URL = 'https://superprivategit.megacorp.com'
  const files = {
    'package.json': ['package.json'],
    'package-lock.json': [],
    'yarn.lock': ['yarn.lock', 'backend/yarn.lock'],
    'shrinkwrap.json': false
  }
  const packageFileName = 'backend/package.json'
  const path = getLockfilePath(files, packageFileName)
  expect(path).toEqual('backend/yarn.lock')
})

test('get single inline node version from travis', () => {
  const travisYML = `language: node_js
services:
- docker
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
node_js: 7
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  expect(versions).toEqual({ startIndex: 8, endIndex: 8, versions: [ '7' ] })
})

test('get single array node version from travis', () => {
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  expect(versions).toEqual({ startIndex: 8, endIndex: 9, versions: [ '- 7' ] })
})

test('get multiple node versions from travis', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8
- 9
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  expect(versions).toEqual({ startIndex: 3, endIndex: 6, versions: ['- 7', '- 8', '- 9'] })
})

test('update travisYML when new version not present', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8
- 9
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8
- 9
- 10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when new version (10) is not present, but 8.10.0 is', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8.10.0
- 9
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8.10.0
- 9
- 10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when the old version is in inline syntax ("7") and maintain delimiters', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: "7"
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- "7"
- "10"
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test("update travisYML when the old version is in array syntax ('7') and maintain delimiters", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '10'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when node definition is at end of file', () => {
  const travisYML = `language: node_js
cache:
  directories:
  - node_modules
notifications:
  email: false
node_js:
  - '7'`
  const targetTravisYML = `language: node_js
cache:
  directories:
  - node_modules
notifications:
  email: false
node_js:
  - '7'
  - '10'`
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when node definition is followed by an empty line', () => {
  const travisYML = `---
language: node_js
node_js:
  - "4"

sudo: false

cache:
  directories:
    - node_modules`
  const targetTravisYML = `---
language: node_js
node_js:
  - "4"
  - "10"

sudo: false

cache:
  directories:
    - node_modules`
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when node definition is followed by a line with only whitespace', () => {
  const travisYML = `---
language: node_js
node_js:
  - "4"

sudo: false

cache:
  directories:
    - node_modules`
  const targetTravisYML = `---
language: node_js
node_js:
  - "4"
  - "10"

sudo: false

cache:
  directories:
    - node_modules`
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('update travisYML when the old version is in inline syntax ("7")', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: 7
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- 7
- 10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(targetTravisYML)
})

test('doesn’t break when travisYML defines no node versions', () => {
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present ("node")', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- "node"
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present ('node')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '9'
- 'node'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present ('lts/*')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '9'
- 'lts/*'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present ('lts/Dubnium')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '9'
- 'lts/Dubnium'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present (v10)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- v7
- v8
- v9
- v10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present ('v10')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 'v7'
- 'v8'
- 'v9'
- 'v10'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present in inline format ('v10')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js: 'v10'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present in inline format (v10)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: v10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present (10)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8
- 9
- 10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present ("10")', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- "7"
- "8"
- "9"
- "10"
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test("doesn’t update travisYML when new version is present ('10')", () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '9'
- '10'
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present (Dubnium)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- '7'
- '8'
- '9'
- Dubnium
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present ("Dubnium")', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- "7"
- "8"
- "9"
- "Dubnium"
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present (10.0.0)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 7
- 8
- 9
- 10.0.0
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present in inline format (10)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: 10
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present in inline format ("10")', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: "10"
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('doesn’t update travisYML when new version is present in inline format (Dubnium)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: Dubnium
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
  const versions = getNodeVersionsFromTravisYML(travisYML)
  const updatedYML = addNodeVersionToTravisYML(travisYML, '10', 'Dubnium', versions)
  expect(updatedYML).toEqual(travisYML)
})

test('removes old version from travisYML (4), 6 is already there', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 4
- 6
- 8
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- 6
- 8
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
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetTravisYML)
})

test('removes old version from travisYML (Argon), Carbon is already there', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- Argon
- Boron
- Carbon
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
  const targetTravisYML = `language: node_js
services:
- docker
node_js:
- Boron
- Carbon
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
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetTravisYML)
})

test('removes old version from travisYML ("4"), "6" is already there', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- "4"
- "5"
- "6"
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
  const targetYML = `language: node_js
services:
- docker
node_js:
- "5"
- "6"
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
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetYML)
})

test('updates 4 -> 6 in travisYML when it’s inline version (node_js: 4)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: 4
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const targetYML = `language: node_js
services:
- docker
node_js:
- 6
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetYML)
})

test('updates 4 -> 6 in travisYML when it’s the only array version (4)', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 4
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const targetYML = `language: node_js
services:
- docker
node_js:
- 6
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetYML)
})

test('replace 4 with 6 in an array of several node versions in travisYML', () => {
  const travisYML = `language: node_js
services:
- docker
node_js:
- 4
- 5
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const targetYML = `language: node_js
services:
- docker
node_js:
- 5
- 6
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetYML)
})

test('replace Argon with 6 in the inline node versions in travisYML', () => {
  const travisYML = `language: node_js
services:
- docker
node_js: Argon
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const targetYML = `language: node_js
services:
- docker
node_js:
- 6
cache:
  directories:
  - $HOME/.npm
notifications:
  email: false
before_install:
- npm install -g npm@5.2.0
install: npm install
after_success: npm run deploy`
  const updatedYML = addNewLowestAndDeprecate({
    travisYML,
    nodeVersion: 4,
    codeName: 'Argon',
    newLowestVersion: 6,
    newLowestCodeName: 'Boron'
  })
  expect(updatedYML).toEqual(targetYML)
})

describe('correctly upgrade node version in .nvmrc', () => {
  test('Don’t upgrade from 9', () => {
    const hasNode = hasNodeVersion('9', '4', 'Argon', true)
    expect(hasNode).toBeFalsy()
  })

  test('Don’t upgrade from v9', () => {
    const hasNode = hasNodeVersion('v9', '4', 'Argon', true)
    expect(hasNode).toBeFalsy()
  })

  test('Don’t upgrade from - 9', () => {
    const hasNode = hasNodeVersion('- 9', '4', 'Argon', true)
    expect(hasNode).toBeFalsy()
  })

  test('Don’t upgrade from - v9', () => {
    const hasNode = hasNodeVersion('- v9', '4', 'Argon', true)
    expect(hasNode).toBeFalsy()
  })

  test('Do upgrade from 4', () => {
    const hasNode = hasNodeVersion('4', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from v4', () => {
    const hasNode = hasNodeVersion('v4', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from 4.1.2', () => {
    const hasNode = hasNodeVersion('4.1.2', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from v4.1.2', () => {
    const hasNode = hasNodeVersion('v4.1.2', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from - 4', () => {
    const hasNode = hasNodeVersion('- 4', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from - v4', () => {
    const hasNode = hasNodeVersion('- v4', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from - 4.1.2', () => {
    const hasNode = hasNodeVersion('- 4.1.2', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })

  test('Do upgrade from - v4.1.2', () => {
    const hasNode = hasNodeVersion('- v4.1.2', '4', 'Argon', true)
    expect(hasNode).toBeTruthy()
  })
})
