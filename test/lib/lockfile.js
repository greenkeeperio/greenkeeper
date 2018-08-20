const nock = require('nock')

describe('getNewLockfile', async () => {
  nock.disableNetConnect()
  const lock = '{"name":"greenkeeper","version":"1.0.0","lockfileVersion":1,"requires":true,"dependencies":{"jest": {"version": "22.4.2"}}}'
  const packageJson = '{"name": "greenkeeper","devDependencies": {"jest": "^22.4.2"}}'

  test('with package-lock.json', async () => {
    const { getNewLockfile } = require('../../lib/lockfile')

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
          newLockfile: true
        }
      })

    await getNewLockfile(packageJson, lock, true)
  })
})
