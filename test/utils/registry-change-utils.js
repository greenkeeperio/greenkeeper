const { test } = require('tap')

const {
  sepperateNormalAndMonorepos,
  getJobsPerGroup,
  filterAndSortPackages,
  getSatisfyingVersions,
  getOldVersionResolved
} = require('../../utils/registry-change-utils')

test('sepperateNormalAndMonorepos', t => {
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

  const output = sepperateNormalAndMonorepos(input)
  t.ok(output.length === 2 && output[0].length && output[1].length, 'sepperates Monorepos from normal repos')
  t.ok(output[0].length === 2 && output[0][0].length === 2 && output[0][1].length === 1, 'finds 2 Monorepos, two with two package.jsons and one with one')
  t.ok(output[1].length === 2 && output[1][0].length === 2 && output[1][1].length === 1, 'finds 2 Normal repos where one has a doubled dependency')

  t.end()
})

test('getJobsPerGroup', t => {
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

  t.ok(getJobsPerGroup(config, monorepo).length === 1, 'creates one job if all package.json files are in the same group')
  t.ok(getJobsPerGroup(config2, monorepo).length === 2, 'creates two jobs if all package.json files are in two groups')
  t.end()
})

test('filterAndSortPackages', t => {
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
  t.ok(output.length === 3 && !outputByType.includes('peerDependencies'), 'throws away peerDependencies')
  t.ok(outputByType[0] === 'dependencies', 'sortes `dependencies` to the top')
  t.ok(outputByType[1] === 'devDependencies', 'sortes `devDependencies` to the middle')
  t.ok(outputByType[2] === 'optionalDependencies', 'sortes `optionalDependencies` to the buttom')
  t.end()
})

test('getSatisfyingVersions', t => {
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
  t.ok(output.length === 2 && output.includes('1.1.0') && output.includes('1.0.0'), 'returns all satisfining versions')
  t.end()
})

test('getOldVersionResolved', t => {
  const satisfyingVersions = ['9.3.1', '9.3.0', '9.2.0']
  const distTags = { latest: '10.0.0' }
  const distTag = 'latest'

  const output = getOldVersionResolved(satisfyingVersions, distTags, distTag)
  t.ok(output === '9.3.1', 'returns the last satisfying version')
  t.end()
})
