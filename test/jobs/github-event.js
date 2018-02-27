beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
})

describe('github-event index', () => {
  test('calls the resolve function', () => {
    expect.assertions(1)

    const githubEvent = require('../../jobs/github-event.js')
    jest.mock('path', () => {
      return {
        resolve: (dirname, eventType, type) => {
          // resolve is called with /foo
          expect(`${dirname}/${eventType}/${type}`).toEqual(`${dirname}/github-event/foo`)
          return dirname
        }
      }
    })

    githubEvent({ type: 'foo' })
  })

  test('calls the resolve function with action', () => {
    expect.assertions(1)

    const githubEvent = require('../../jobs/github-event.js')
    jest.mock('path', () => {
      return {
        resolve: (dirname, eventType, type, action) => {
          // resolve is called with /foo/bar
          expect(`${dirname}/${eventType}/${type}/${action}`).toEqual(`${dirname}/github-event/foo/bar`)
          return dirname
        }
      }
    })

    githubEvent({ type: 'foo', action: 'bar' }, '456')
  })
})
