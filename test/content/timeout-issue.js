const { cleanCache, requireFresh } = require('../helpers/module-cache-helpers')

describe('timeout issue content', async () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.GITHUB_HOST
    delete process.env.GITHUB_URL
    cleanCache('../../lib/env')
  })

  test('includes the link to the initial branch on the custom github host', async () => {
    process.env.GITHUB_HOST = 'https://enterprise.github/api/v3/'
    const content = requireFresh('../../content/timeout-issue')

    const issueContent = content({fullName: 'finnp/abc'})
    // includes the link to the repo at the custom host
    expect(issueContent).toMatch(/enterprise\.github\/finnp\/abc/)
    // t.match(issueContent, /enterprise\.github\/finnp\/abc/, 'includes the link to the repo at the custom host')
  })

  test('includes the link to the initial branch on the regular github host', async () => {
    const content = requireFresh('../../content/timeout-issue')

    const issueContent = content({fullName: 'finnp/abc'})
    // includes the link to the repo at github.com
    expect(issueContent).toMatch(/github\.com\/finnp\/abc/)
    // t.match(issueContent, /github\.com\/finnp\/abc/, 'includes the link to the repo at github.com')
  })
})
