const { test } = require('tap')
const { cleanCache, requireFresh } = require('../helpers/module-cache-helpers')

test('timeout issue content', async t => {
  t.afterEach(() => {
    delete process.env.GITHUB_HOST
    delete process.env.GITHUB_URL
    cleanCache('../../lib/env')
  })

  t.test('includes the link to the initial branch on the custom github host', async t => {
    process.env.GITHUB_HOST = 'https://enterprise.github/api/v3/'
    const content = requireFresh('../../content/timeout-issue')

    const issueContent = content({fullName: 'finnp/abc'})
    t.match(issueContent, /enterprise\.github\/finnp\/abc/, 'includes the link to the repo at the custom host')

    t.end()
  })

  t.test('includes the link to the initial branch on the regular github host', async t => {
    const content = requireFresh('../../content/timeout-issue')

    const issueContent = content({fullName: 'finnp/abc'})
    t.match(issueContent, /github\.com\/finnp\/abc/, 'includes the link to the repo at github.com')

    t.end()
  })
})
