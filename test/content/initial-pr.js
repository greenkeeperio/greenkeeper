const { cleanCache, requireFresh } = require('../helpers/module-cache-helpers')

describe('initial pr content', async () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.HOOKS_HOST
    cleanCache('../../lib/env')
  })

  test('includes set up guide for hooks if secret was provided', async () => {
    const content = requireFresh('../../content/initial-pr')

    const prContent = content({ ghRepo: 'finnp/abc', secret: 'S3CR3T' })
    expect(prContent).toMatch('https://hooks.greenkeeper.io/npm')
  })

  test('includes the link to the custom hooks host', async () => {
    process.env.HOOKS_HOST = 'custom-hooks-host.com'
    const content = requireFresh('../../content/initial-pr')

    const prContent = content({ ghRepo: 'finnp/abc', secret: 'S3CR3T' })
    expect(prContent).toMatch('custom-hooks-host.com')
  })
})
