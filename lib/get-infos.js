const url = require('url')

const _ = require('lodash')
const githubFromGit = require('github-url-from-git')

const getRelease = require('./get-release')
const getDiffCommits = require('./get-diff-commits')

module.exports = async function getInfos (
  { installationId, dependency, monorepoGroupName, version, diffBase, versions }
) {
  const dependencyName = monorepoGroupName || dependency
  const infos = {
    // TODO: enterprise
    dependencyLink: `[${dependencyName}](https://www.npmjs.com/package/${dependencyName})`
  }

  const baseVersionData = versions[diffBase]
  const versionData = versions[version]
  if (!baseVersionData || !versionData) return infos

  const depGhUrl = url.parse(
    githubFromGit(_.get(versionData, 'repository.url')) || ''
  )
  const slug = depGhUrl.pathname && depGhUrl.pathname.replace(/^\//, '')

  if (!slug) return infos

  infos.dependencyLink = `[${dependencyName}](${url.format(depGhUrl)})`

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
