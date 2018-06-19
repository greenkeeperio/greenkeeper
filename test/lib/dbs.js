const lolex = require('lolex')
const dbs = require('../../lib/dbs')

describe('dbs access', () => {
  test('getLogsDb memoization', async () => {
    const clock = lolex.install()

    const logsDb = dbs.getLogsDb()

    // validate db instance is equal
    const nextLogsDb = dbs.getLogsDb()
    expect(nextLogsDb).toBe(logsDb)

    // jump one month
    clock.tick(60 * 60 * 24 * 31 * 1000)
    const nextMonthsLogsDb = dbs.getLogsDb()
    expect(nextMonthsLogsDb).not.toBe(logsDb)
    clock.uninstall()
  })
})
