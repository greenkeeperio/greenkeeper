/*
  Ihis job is being run every $interval (say 5 minutes).

  It checks npm/_design/monorepo-releases-by-time for any
  releases that should have gone out >= 30 minutes ago.

  If the view returns any results, start a registry-change job
  for any of the sub-packages witht the current version.

  registry-change will in turn call create-version-branch, which
  then cleans up release documents.

  Release documents have this structure:
  {
     _id: monorepo:monogroup:version,
     updatedAt: new Date().toJSON(),
     distTags: Array(),
     distTag: String()
  }
*/

const { pendingMonorepoReleases } = require('../lib/monorepo')

module.exports = async function () {
  const releases = await pendingMonorepoReleases()

  return releases.map((release) => {

    // TODO: send slack/email notifications to us / Enterprise admins

    return {
      name: 'registry-change',
      dependency: release.dependency,
      distTags: release.distTags,
      versions: release.versions
    }
  })
}
