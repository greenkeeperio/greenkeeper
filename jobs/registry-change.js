const _ = require('lodash')
const semver = require('semver')

const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')
const statsd = require('../lib/statsd')
const getConfig = require('../lib/get-config')
const {sepperateNormalAndMonorepos, getJobsPerGroup, filterAndSortPackages} = require('../utils/registry-change-utils')

module.exports = async function (
  { dependency, distTags, versions, installation }
) {
  const { installations, repositories, npm } = await dbs()

  const isFromHook = _.isString(installation)
  let npmDoc = {
    _id: dependency,
    distTags,
    versions
  }

  // use prefix for packageFilesForUpdatedDependency sent via webhook
  if (isFromHook) npmDoc._id = `${installation}:${npmDoc._id}`

  try {
    var npmDbDoc = await npm.get(npmDoc._id)
  } catch (err) {
    if (err.status !== 404) throw err
    npmDbDoc = {}
  }

  const oldDistTags = npmDbDoc.distTags || {}
  const distTag = _.findKey(distTags, (version, tag) => {
    const oldVersion = oldDistTags[tag]
    if (!oldVersion) return true

    return semver.lt(oldVersion, version)
  })

  if (!distTag) return
  await npm.put(updatedAt(Object.assign(npmDbDoc, npmDoc)))

  // currently we only handle latest versions
  // so we can heavily optimise by exiting here
  // we want to handle different distTags in the future
  if (distTag !== 'latest') return

  /*
  Update: 'by_dependency' already handles multiple package.json files, but not in the same result.

  You get one result per matching dependency per depencyType per file in `packageFilesForUpdatedDependency`. The `value`
  object for each result (used below, in `filteredSortedPackages` for example), looks like:

  "value": {
    "fullName": "aveferrum/angular-material-demo",
    "accountId": "462667",
    "filename": "frontend/package.json", // <- yay, works
    "type": "dependencies",
    "oldVersion": "^4.2.4"
  }

  Then in a separate result, you’d get

  "value": {
    "fullName": "aveferrum/angular-material-demo",
    "accountId": "462667",
    "filename": "backend/package.json",
    "type": "dependencies",
    "oldVersion": "^4.2.4"
  }

  So we’d need to either completely change how that view works (boo), or maybe add a clever reduce (?),
  or collect the results per repo in this file, so we only fire off 'create-version-branch' once per
  repo, not once per file per repo.

  Note that we also have these views that still need to be checked:
  - pr_open_by_dependency
  - branch_by_dependency
  - issue_open_by_dependency

  */

  // packageFilesForUpdatedDependency are a list of all repoDocs that have that dependency (should rename that)
  const packageFilesForUpdatedDependency = (await repositories.query('by_dependency', {
    key: dependency
  })).rows

  if (!packageFilesForUpdatedDependency.length) return

  if (packageFilesForUpdatedDependency.length > 100) statsd.event('popular_package')

  // check if package has a greenkeeperrc / more then 1 package json or package.json is in subdirectory
  // continue with the rest but send all otheres to a 'new' version branch job

  let jobs = []
  const sepperatedResults = sepperateNormalAndMonorepos(packageFilesForUpdatedDependency)

  const withOnlyRootPackageJSON = _.flatten(sepperatedResults[1])
  const withMultiplePackageJSON = sepperatedResults[0]

  // get config
  const keysToFindMonorepoDocs = _.compact(_.map(withMultiplePackageJSON, (group) => group[0].value.fullName))
  if (keysToFindMonorepoDocs.length) {
    const monorepoDocs = (await repositories.query('by_full_name', {
      keys: keysToFindMonorepoDocs,
      include_docs: true
    })).rows

    _.forEach(withMultiplePackageJSON, monorepo => {
      const repoDoc = monorepoDocs.find(doc => doc.key === monorepo[0].value.fullName)
      if (!repoDoc) return
      const config = getConfig(repoDoc.doc)
      jobs = jobs.concat(getJobsPerGroup(config, monorepo))
    })
  }

  const accounts = _.keyBy(
    _.map(
      (await installations.allDocs({
        keys: _.compact(_.map(withOnlyRootPackageJSON, 'value.accountId')),
        include_docs: true
      })).rows,
      'doc'
    ),
    '_id'
  )

  // Prioritize `dependencies` over all other dependency types
  // https://github.com/greenkeeperio/greenkeeper/issues/409

  const filteredSortedPackages = filterAndSortPackages(withOnlyRootPackageJSON)

  jobs = [...jobs, ...(_.sortedUniqBy(filteredSortedPackages, pkg => pkg.value.fullName)
    .map(pkg => {
      const account = accounts[pkg.value.accountId]
      const plan = account.plan

      const satisfyingVersions = Object.keys(versions)
        .filter(version => semver.satisfies(version, pkg.value.oldVersion))
        .sort(semver.rcompare)

      const oldVersionResolved = satisfyingVersions[0] === distTags[distTag]
        ? satisfyingVersions[1]
        : satisfyingVersions[0]

      if (isFromHook && String(account.installation) !== installation) return {}

      return {
        data: Object.assign(
          {
            name: 'create-version-branch',
            dependency,
            distTags,
            distTag,
            versions,
            oldVersionResolved,
            repositoryId: pkg.id,
            installation: account.installation,
            plan
          },
          pkg.value
        ),
        plan
      }
    }))
  ]

  return jobs
}
