const nock = require('nock')
const simple = require('simple-mock')

nock.disableNetConnect()
nock.enableNetConnect('localhost')

test('parse github host', async () => {
  expect.assertions(1)

  nock('https://enterprise.github')
    .get('/api/v3/repos/greenkeeperio/greenkeeper')
    .reply(200, () => {
      expect(true).toBeTruthy()
    })

  simple.mock(process.env, 'GITHUB_HOST', 'https://enterprise.github')

  const Github = require('../../lib/github')
  const github = Github()

  try {
    await github.repos.get({ owner: 'greenkeeperio', repo: 'greenkeeper' })
  } catch (error) {
    expect(error).toBeFalsy()
  }

  simple.restore()
})
