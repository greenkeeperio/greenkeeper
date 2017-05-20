module.exports = async function ({ github, owner, repo, version, sha }) {
  const headers = {
    Accept: 'application/vnd.github.machine-man-preview.v3.html+json'
  }

  let result
  try {
    result = await github.repos.getReleaseByTag({
      headers,
      owner,
      repo,
      tag: `v${version}`
    })
  } catch (err) {
    try {
      result = await github.repos.getReleaseByTag({
        headers,
        owner,
        repo,
        tag: `${version}`
      })
    } catch (err) {
      try {
        const { tag } = await github.gitdata.getTag({ owner, repo, sha })

        result = await github.repos.getReleaseByTag({
          headers,
          owner,
          repo,
          tag
        })
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
