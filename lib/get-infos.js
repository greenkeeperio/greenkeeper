const url = require('url')

const _ = require('lodash')
const githubFromGit = require('github-url-from-git')

const getRelease = require('./get-release')
const getDiffCommits = require('./get-diff-commits')
const statsd = require('../lib/statsd')

// returns a url object if you pass in a GitHub repositoryURL,
// returns a string with an npm URL if you just pass in a dependency name
function getDependencyURL ({ repositoryURL, dependency }) {
  // githubURL is an object!
  const githubURL = url.parse(
    githubFromGit(repositoryURL) || ''
  )
  if (dependency && !githubURL.href) {
    return `https://www.npmjs.com/package/${dependency}`
  }
  return githubURL
}

// removes logins and hashes etc.
function getFormattedDependencyURL ({ repositoryURL, dependency }) {
  return url.format(getDependencyURL({ repositoryURL, dependency }))
}

async function getInfos (
  { installationId, dependency, version, diffBase, versions }
) {
  const infos = {}

  const baseVersionData = versions[diffBase]
  const versionData = versions[version]
  if (!baseVersionData || !versionData) return infos

  const depGhUrl = getDependencyURL({ repositoryURL: _.get(versionData, 'repository.url') })
  // remove the leading slash to get the slug
  // depGhUrl.pathname: '/colors/monorepo'
  const slug = depGhUrl.pathname && depGhUrl.pathname.replace(/^\//, '')
  if (!slug) return infos

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

function resolver ({ dependency, version, diffBase }) {
  return `${dependency}${version}${diffBase}`
}

const memoizedGetInfos = _.memoize(getInfos, resolver)

if (process.env.NODE_ENV !== 'testing') {
  setInterval(() => {
    statsd.gauge('get_infos_cached', memoizedGetInfos.cache.size)
  }, 60000)
}

module.exports = {
  getInfos: memoizedGetInfos,
  getDependencyURL,
  getFormattedDependencyURL
}
