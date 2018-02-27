describe('github-event index', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  test('calls the resolve function', () => {
    expect.assertions(1)

    jest.mock('path', () => {
      return {
        resolve: (dirname, eventType, type) => {
          // resolve is called with /foo
          expect(`${dirname}/${eventType}/${type}`).toEqual(`${dirname}/github-event/foo`)
          return dirname
        }
      }
    })
    const githubEvent = require('../../jobs/github-event.js')

    githubEvent({ type: 'foo' })
  })

  test('calls the resolve function with action', () => {
    expect.assertions(1)

    jest.mock('path', () => {
      return {
        resolve: (dirname, eventType, type, action) => {
          // resolve is called with /foo/bar
          expect(`${dirname}/${eventType}/${type}/${action}`).toEqual(`${dirname}/github-event/foo/bar`)
          return dirname
        }
      }
    })
    const githubEvent = require('../../jobs/github-event.js')

    githubEvent({ type: 'foo', action: 'bar' }, '456')
  })
})
