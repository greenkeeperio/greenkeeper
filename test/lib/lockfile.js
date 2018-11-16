const nock = require('nock')
const { getNewLockfile } = require('../../lib/lockfile')

describe('getNewLockfile', async () => {
  beforeEach(() => {
    jest.resetModules()
  })

  nock.disableNetConnect()
  nock.enableNetConnect('localhost:5984')
  const lock = '{"name":"greenkeeper","version":"1.0.0","lockfileVersion":1,"requires":true,"dependencies":{"jest": {"version": "22.4.2"}}}'

  test('with changed package-lock.json', async () => {
    const { getNewLockfile } = require('../../lib/lockfile')
    const packageJson = '{"name": "greenkeeper","devDependencies": {"jest": "^22.4.3"}}'
    const newLock = '{"name":"greenkeeper","version":"1.0.0","lockfileVersion":1,"requires":true,"dependencies":{"jest": {"version": "22.4.3"}}}'

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.packageJson).toBe('string')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => {
        return {
          ok: true,
          contents: newLock
        }
      })

    await getNewLockfile({ packageJson, lock, isNpm: true })
  })

  test('with package-lock.json', async () => {
    const packageJson = '{"name": "greenkeeper","devDependencies": {"jest": "^22.4.2"}}'

    nock('http://localhost:1234')
      .post('/', (body) => {
        expect(typeof body.type).toBe('string')
        expect(typeof body.packageJson).toBe('string')
        expect(typeof body.lock).toBe('string')
        expect(body).toMatchSnapshot()
        return true
      })
      .reply(200, () => ({ ok: false }))

    await getNewLockfile({ packageJson, lock, isNpm: true })
  })

  test('with package-lock.json with Network Error', async () => {
    const httpTraffic = nock('http://localhost:1234')
      .post('/', (body) => {
        return true
      })
      .replyWithError({ code: 'ETIMEDOUT' })
      .post('/', (body) => {
        return true
      })
      .reply(200, () => ({ ok: false }))
    const packageJson = '{"name": "greenkeeper","devDependencies": {"jest": "^22.4.2"}}'
    await getNewLockfile({ packageJson, lock, isNpm: true })
    expect(httpTraffic.isDone()).toBeTruthy()
    expect(httpTraffic.pendingMocks().length).toEqual(0)
  })
})
