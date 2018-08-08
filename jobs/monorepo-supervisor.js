const Log = require('gk-log')

const dbs = require('../lib/dbs')
const { getMonorepoGroupNameForPackage } = require('../lib/monorepo')
const { notifyAdmin } = require('../lib/comms')

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

async function sendSlackNotification (dependency) {
  const groupName = await getMonorepoGroupNameForPackage(dependency)
  const message = `There has been an incomplete release of the monorepo \`${groupName}\`, not all modules listed in the monorepo definition have been released together. This _may_ mean that the release definition for this monorepo is out of date.`
  notifyAdmin(message)
}

module.exports = async function () {
  const logs = dbs.getLogsDb()
  const log = Log({logsDb: logs, accountId: null, repoSlug: null, context: 'monorepo-supervisor'})

  const releases = await pendingMonorepoReleases()

  log.info(`starting ${releases.length} monorepo releases`, {releases})

  const jobs = releases.map((release) => {
    // We don't want ths for now
    // remove if condifion to activate slacknotification again
    if (release.slack) sendSlackNotification(release.dependency)

    return {
      data: {
        name: 'registry-change',
        dependency: release.dependency,
        distTags: release.distTags,
        versions: release.versions,
        force: true
      }
    }
  })

  log.info(`created ${jobs.length} jobs`, {jobs})

  return jobs
}
