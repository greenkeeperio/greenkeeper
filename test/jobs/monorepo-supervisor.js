const dbs = require('../../lib/dbs')
const removeIfExists = require('../helpers/remove-if-exists')

describe('monorepo supervisor', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    // Mock away sending admin notifications so we don‘t get spammed when tests run.
    jest.mock('../../lib/comms', () => {
      const lib = require.requireActual('../../lib/comms')
      lib.notifyAdmin = () => {}
      return lib
    })
  })
  afterAll(async () => {
    const { npm } = await dbs()
    await Promise.all([
      removeIfExists(npm, 'monorepo:wibbly', 'monorepo:wobbly')
    ])
  })

  test('start 2 jobs for 2 pending releases', async () => {
    jest.mock('../../lib/monorepo', () => {
      const lib = require.requireActual('../../lib/monorepo')
      lib.pendingMonorepoReleases = () => {
        return [{
          _id: 'monorepo:wobbly',
          distTags: {
            latest: '2.0.0'
          },
          versions: {
            '2.0.0': {
              gitHead: 'timey'
            },
            '1.0.0': {
              gitHead: 'wimey'
            }
          },
          dependency: 'wobbly'
        },
        {
          _id: 'monorepo:wibbly',
          distTags: {
            latest: '2.0.0'
          },
          versions: {
            '2.0.0': {
              gitHead: 'smurf'
            },
            '1.0.0': {
              gitHead: 'sky'
            }
          },
          dependency: 'wibbly'
        }]
      }
      lib.getMonorepoGroupNameForPackage = (dependencyName) => {
        return dependencyName === 'wobbly' ? 'timelord' : 'tardis'
      }
      return lib
    })
    const monorepoSupervisor = require('../../jobs/monorepo-supervisor')
    const newJob = await monorepoSupervisor()
    expect(newJob).toBeTruthy()
    expect(newJob[0].data.name).toEqual('registry-change')
    expect(newJob[0].data.dependency).toEqual('wobbly')
    expect(newJob[1].data.dependency).toEqual('wibbly')
  })

  test('no pending releases', async () => {
    jest.mock('../../lib/monorepo', () => {
      const lib = require.requireActual('../../lib/monorepo')
      lib.pendingMonorepoReleases = () => {
        return []
      }
      return lib
    })
    const monorepoSupervisor = require('../../jobs/monorepo-supervisor')
    const newJob = await monorepoSupervisor()
    expect(newJob).toHaveLength(0)
  })
})
