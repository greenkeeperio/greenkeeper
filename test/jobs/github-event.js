// const { resolve } = require('path')

test('github-event index', () => {
  expect.assertions(2)

  // const githubEvent = proxyquire('../../jobs/github-event.js', {
  //   [resolve(__dirname, '../../jobs/github-event/foo')]: () => expect(true).toBeTruthy(),
  //   [resolve(__dirname, '../../jobs/github-event/foo/bar')]: () => expect(true).toBeTruthy()
  // })

  const githubEvent = require('../../jobs/github-event.js')
  jest.mock('path', () => () => {
    const { resolve } = require('path')
    expect(resolve).toBeCalledWith(__dirname, '../../jobs/github-event/foo')
  })
  // jest.mock(resolve(__dirname, '../../jobs/github-event/foo'), () => () => {
  //   console.log('bla')
  //   expect(true).toBeTruthy()
  // })

  //  {
  //   [resolve(__dirname, '../../jobs/github-event/foo')]: () => expect(true).toBeTruthy(),
  //   [resolve(__dirname, '../../jobs/github-event/foo/bar')]: () => expect(true).toBeTruthy()
  // })

  const test = githubEvent({ type: 'foo' })
  console.log(test)
  // githubEvent({ type: 'foo', action: 'bar' }, '456')
})
