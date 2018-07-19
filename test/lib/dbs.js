const lolex = require('lolex')
const dbs = require('../../lib/dbs')

describe('dbs access', () => {
  test('getLogsDb memoization', async () => {
    const clock = lolex.install({now: new Date()})

    const logsDb = dbs.getLogsDb()

    // validate db instance is equal
    const nextLogsDb = dbs.getLogsDb()
    // we should use nextLogsDb.name here, but a Node bug
    // in Proxys prevents us from getting at the original
    // value here.
    expect(nextLogsDb).toBe(logsDb)

    // jump one month
    clock.tick(60 * 60 * 24 * 45 * 1000)
    const nextMonthsLogsDb = dbs.getLogsDb()
    // we should use nextLogsDb.name here, but a Node bug
    // in Proxys prevents us from getting at the original
    // value here.
    expect(nextMonthsLogsDb).not.toBe(logsDb)

    clock.uninstall()
  })
})
