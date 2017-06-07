const url = require('url')

const _ = require('lodash')
const githubFromGit = require('github-url-from-git')

const getRelease = require('./get-release')
const getDiffCommits = require('./get-diff-commits')

module.exports = async function getInfos (
  { installationId, dependency, version, diffBase, versions }
) {
  const infos = {
    // TODO: enterprise
    dependencyLink: `[${dependency}](https://www.npmjs.com/package/${dependency})`
  }

  const baseVersionData = versions[diffBase]
  const versionData = versions[version]
  if (!baseVersionData || !versionData) return infos

  const depGhUrl = url.parse(
    githubFromGit(_.get(versionData, 'repository.url')) || ''
  )
  const slug = depGhUrl.pathname && depGhUrl.pathname.replace(/^\//, '')

  if (!slug) return infos

  infos.dependencyLink = `[${dependency}](${url.format(depGhUrl)})`

  const [owner, repo] = slug.split('/')

  infos.release = await getRelease({
    installationId,
    owner,
    repo,
    version,
    sha: versionData.gitHead
  })

  if (!baseVersionData.gitHead || !versionData.gitHead) return infos

  infos.diffCommits = await getDiffCommits({
    installationId,
    owner,
    repo,
    base: baseVersionData.gitHead,
    head: versionData.gitHead
  })

  return infos
}
