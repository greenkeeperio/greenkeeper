const { test } = require('tap')

const {sepperateNormalAndMonorepos, getJobsPerGroup} = require('../../utils/registry-change-utils')

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
