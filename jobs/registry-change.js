const _ = require('lodash')
const semver = require('semver')

const dbs = require('../lib/dbs')
const updatedAt = require('../lib/updated-at')
const statsd = require('../lib/statsd')

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

  // use prefix for packages sent via webhook
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

  const packages = (await repositories.query('by_dependency', {
    key: dependency
  })).rows

  if (!packages.length) return

  if (packages.length > 100) statsd.event('popular_package')

  const accounts = _.keyBy(
    _.map(
      (await installations.allDocs({
        keys: _.compact(_.map(packages, 'value.accountId')),
        include_docs: true
      })).rows,
      'doc'
    ),
    '_id'
  )

  // Prioritize `dependencies` over all other dependency types
  // https://github.com/greenkeeperio/greenkeeper/issues/409

  const order = {
    'dependencies': 1,
    'devDependencies': 2,
    'optionalDependencies': 3
  }

  const sortByDependency = (packageA, packageB) => {
    return order[packageA.value.type] - order[packageB.value.type]
  }

  const filteredSortedPackages = packages
    .filter(pkg => pkg.value.type !== 'peerDependencies')
    .sort(sortByDependency)

  return _.sortedUniqBy(filteredSortedPackages, pkg => pkg.value.fullName)
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
    })
}
