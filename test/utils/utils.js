const {
  seperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved,
  generateGitHubCompareURL
} = require('../../utils/utils')

test('seperateNormalAndMonorepos', () => {
  const input = [
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }},
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }},
    { id: '456-monorepo',
      key: 'react',
      value: {
        fullName: 'lily/monorepo',
        accountId: '123-two-packages',
        filename: 'packages/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }},
    { id: '775',
      key: 'eslint',
      value: {
        fullName: 'owner/repo3',
        accountId: '999',
        filename: 'package.json',
        type: 'devDependencies',
        oldVersion: '1.0.0' }},
    { id: '775',
      key: 'eslint',
      value: {
        fullName: 'owner/repo3',
        accountId: '999',
        filename: 'package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }},
    { id: '776',
      key: 'eslint',
      value: {
        fullName: 'owner/repo2',
        accountId: '999',
        filename: 'package.json',
        type: 'peerDependencies',
        oldVersion: '1.0.0' }}
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
        oldVersion: '1.0.0' }},
    { id: '123-monorepo',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }}
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
    plan
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
    plan})).toHaveLength(2)
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
        oldVersion: '1.0.0' }},
    { id: 'optionalDependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'package.json',
        type: 'optionalDependencies',
        oldVersion: '1.0.0' }},
    { id: 'dependencies',
      key: 'react',
      value: {
        fullName: 'hans/monorepo',
        accountId: '123-two-packages',
        filename: 'backend/package.json',
        type: 'dependencies',
        oldVersion: '1.0.0' }},
    { id: 'peerDependencies',
      key: 'react',
      value: {
        fullName: 'owner/repo2',
        accountId: '999',
        filename: 'package.json',
        type: 'peerDependencies',
        oldVersion: '1.0.0' }}
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
        oldVersion: '^1.0.0' }}

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

test('generate relative github compare URL', () => {
  const githubURL = undefined
  const fullName = 'hanshansen/mopeds'
  const branch = 'master'
  const compareWith = 'greenkeeper/frontend/standard-10.0.0'
  const url = generateGitHubCompareURL(githubURL, fullName, branch, compareWith)
  expect(url).toEqual('/hanshansen/mopeds/compare/master...hanshansen:greenkeeper%2Ffrontend%2Fstandard-10.0.0')
})

test('generate absolute github compare URL', () => {
  const githubURL = 'https://superprivategit.megacorp.com'
  const fullName = 'hanshansen/mopeds'
  const branch = 'dev'
  const compareWith = 'greenkeeper/frontend/standard-10.0.0'
  const url = generateGitHubCompareURL(githubURL, fullName, branch, compareWith)
  expect(url).toEqual('https://superprivategit.megacorp.com/hanshansen/mopeds/compare/dev...hanshansen:greenkeeper%2Ffrontend%2Fstandard-10.0.0')
})
