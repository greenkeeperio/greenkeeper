const githubQueue = require('./github-queue')

module.exports = async function ({ installationId, owner, repo, version, sha }) {
  const ghqueue = githubQueue(installationId)

  let result
  try {
    result = await ghqueue.read(github => github.repos.getReleaseByTag({
      owner,
      repo,
      tag: `v${version}`
    }))
  } catch (err) {
    try {
      result = await ghqueue.read(github => github.repos.getReleaseByTag({
        owner,
        repo,
        tag: `${version}`
      }))
    } catch (err) {
      try {
        const { tag } = await ghqueue.read(github => github.gitdata.getTag({ owner, repo, sha }))

        result = await ghqueue.read(github => github.repos.getReleaseByTag({
          owner,
          repo,
          tag
        }))
      } catch (err) {
        return ''
      }
    }
  }

  if (!result || !result.body_html) return ''

  const body = result.body_html.replace(
    /href="https?:\/\/github\.com\//gmi,
    'href="https://urls.greenkeeper.io/'
  )

  return `<details>
<summary>Release Notes</summary>
<strong>${result.name || result.tag_name}</strong>

${body}
</details>\n`
}
