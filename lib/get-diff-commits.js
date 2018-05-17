const diffContent = require('../content/diff-commits')
const githubQueue = require('./github-queue')
const env = require('./env')

module.exports = async function ({ installationId, owner, repo, base, head }) {
  if (!(base && head)) return null

  const ghqueue = githubQueue(installationId)

  try {
    const diff = await ghqueue.read(github => github.repos.compareCommits({ base, head, owner, repo }))

    if (!diff) return ''

    var body = await ghqueue.read(github => github.misc.renderMarkdown({
      text: diffContent(diff),
      mode: 'gfm',
      context: `${owner}/${repo}`
    }))
  } catch (e) {}

  if (!body) return ''

  body = body.replace(
    /href="https?:\/\/github\.com\//gmi,
    `href="https://urls.${env.GK_HOST}/`
  )

  return `<details>
<summary>Commits</summary>
${body}
</details>`
}
