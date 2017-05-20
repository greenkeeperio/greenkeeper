const diffContent = require('../content/diff-commits')

module.exports = async function ({ github, owner, repo, base, head }) {
  if (!(base && head)) return null

  try {
    const diff = await github.repos.compareCommits({ base, head, owner, repo })

    if (!diff) return ''

    var body = (await github.misc.renderMarkdown({
      text: diffContent(diff),
      mode: 'gfm',
      context: `${owner}/${repo}`
    })).data
  } catch (e) {}

  if (!body) return ''

  body = body.replace(
    /href="https?:\/\/github\.com\//gmi,
    'href="https://urls.greenkeeper.io/'
  )

  return `<details>
<summary>Commits</summary>
${body}
</details>`
}
