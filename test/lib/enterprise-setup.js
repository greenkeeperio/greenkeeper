const lolex = require('lolex')

const enterpriseSetup = require('../../lib/enterprise-setup')

describe('enterprise setup', () => {
  test('creates LogsDb for actual and next month', async() => {
    const clock = lolex.install()
    const enterpriseDbs = await enterpriseSetup()

    expect(enterpriseDbs).toHaveLength(3)
    expect(enterpriseDbs[0].db_name).toEqual('_users')
    expect(enterpriseDbs[1].db_name).toEqual('logs-1970-01-staging')
    expect(enterpriseDbs[2].db_name).toEqual('logs-1970-02-staging')

    clock.uninstall()
  })

  test('removes LogsDbs if there are older than 12 month', async() => {
    const clock = lolex.install()

    let enterpriseDbs = await enterpriseSetup()
    expect(enterpriseDbs).toHaveLength(3)
    expect(enterpriseDbs[0].db_name).toEqual('_users')
    expect(enterpriseDbs[1].db_name).toEqual('logs-1970-01-staging')
    expect(enterpriseDbs[2].db_name).toEqual('logs-1970-02-staging')

    // jump 9 months
    for (let i = 3; i <= 12; i++) {
      clock.tick(60 * 60 * 24 * 31 * 1000)
      enterpriseDbs = await enterpriseSetup()
      let dateI = i
      if (i <= 9) dateI = '0' + i
      expect(enterpriseDbs[i].db_name).toEqual(`logs-1970-${dateI}-staging`)
    }

    clock.tick(60 * 60 * 24 * 31 * 1000)
    enterpriseDbs = await enterpriseSetup()
    expect(enterpriseDbs[0].db_name).toEqual('_users')
    expect(enterpriseDbs[1].db_name).toEqual('logs-1970-02-staging')
    expect(enterpriseDbs[12].db_name).toEqual('logs-1971-01-staging')

    clock.uninstall()
  })
})
