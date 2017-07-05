const { test, tearDown } = require('tap')

const dbs = require('../../lib/dbs')
const worker = require('../../jobs/registry-change.js')

test('registry change create jobs', async t => {
  const { installations, repositories, npm } = await dbs()

  await Promise.all([
    installations.put({
      _id: '999',
      installation: 37,
      plan: 'free'
    }),
    repositories.put({
      _id: '888',
      enabled: true,
      type: 'repository',
      fullName: 'owner/repo',
      accountId: '999',
      packages: {
        'package.json': {
          dependencies: {
            standard: '1.0.0'
          }
        }
      }
    }),
    repositories.put({
      _id: '777',
      type: 'repository',
      fullName: 'owner/another',
      accountId: '999',
      packages: {
        'package.json': {
          dependencies: {
            standard: '1.0.0'
          }
        }
      }
    }),
    npm.put({
      _id: 'standard',
      distTags: {
        latest: '1.0.0'
      }
    }),
    npm.put({
      _id: 'eslint',
      distTags: {
        latest: '1.0.0'
      }
    })
  ])

  const newJobs = await worker({
    name: 'registry-change',
    dependency: 'standard',
    distTags: {
      latest: '8.0.0'
    },
    versions: {
      '8.0.0': {
        gitHead: 'deadbeef'
      }
    },
    registry: 'https://skimdb.npmjs.com/registry'
  })

  t.is(newJobs.length, 1)
  t.is(newJobs[0].data.repositoryId, '888')
  t.is(newJobs[0].data.distTag, 'latest')
  t.false(newJobs[0].data.private)

  t.test('registry change skip already processed version', async tt => {
    const newJobs = await worker({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0'
      },
      versions: {
        '8.0.0': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    tt.false(newJobs)
    tt.end()
  })

  t.test('registry change skip distTags other than latest', async tt => {
    const newJobs = await worker({
      name: 'registry-change',
      dependency: 'standard',
      distTags: {
        latest: '8.0.0',
        next: '8.0.1'
      },
      versions: {
        '8.0.1': {},
        '8.0.0': {
          gitHead: 'deadbeef'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    tt.false(newJobs)
    tt.end()
  })

  t.test('registry change skip peerDependencies', async tt => {
    tt.plan(1)
    await repositories.put({
      _id: '776',
      enabled: true,
      type: 'repository',
      fullName: 'owner/repo2',
      accountId: '999',
      packages: {
        'package.json': {
          peerDependencies: {
            eslint: '1.0.0'
          }
        }
      }
    })

    const newJobs = await worker({
      name: 'registry-change',
      dependency: 'eslint',
      distTags: {
        latest: '9.0.0'
      },
      versions: {
        '9.0.0': {
          gitHead: 'b75aeb1'
        }
      },
      registry: 'https://skimdb.npmjs.com/registry'
    })

    tt.is(newJobs.length, 0, 'no new jobs')
    tt.end()
  })
  t.end()
})

tearDown(async () => {
  const { installations, repositories, npm } = await dbs()

  await installations.remove(await installations.get('999'))
  await repositories.remove(await repositories.get('888'))
  await repositories.remove(await repositories.get('777'))
  await repositories.remove(await repositories.get('776'))
  await npm.remove(await npm.get('standard'))
  await npm.remove(await npm.get('eslint'))
})
