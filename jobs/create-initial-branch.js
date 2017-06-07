const crypto = require('crypto')
const { extname } = require('path')

const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const { promisify } = require('bluebird')
const semver = require('semver')
const badger = require('readme-badger')
const yaml = require('js-yaml')
const yamlInPlace = require('yml-in-place')
const escapeRegex = require('escape-string-regexp')

const RegClient = require('../lib/npm-registry-client')
const env = require('../lib/env')
const getRangedVersion = require('../lib/get-ranged-version')
const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const { updateRepoDoc } = require('../lib/repository-docs')
const githubQueue = require('../lib/github-queue')
const { maybeUpdatePaymentsJob } = require('../lib/payments')
const upsert = require('../lib/upsert')

const registryUrl = env.NPM_REGISTRY

module.exports = async function ({ repositoryId }) {
  const { installations, repositories } = await dbs()
  const repoDoc = await repositories.get(repositoryId)
  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation

  if (repoDoc.fork && !repoDoc.hasIssues) return

  await updateRepoDoc(installationId, repoDoc)
  if (!_.get(repoDoc, ['packages', 'package.json'])) return
  await upsert(repositories, repoDoc._id, repoDoc)

  const config = getConfig(repoDoc)
  if (config.disabled) return
  const pkg = _.get(repoDoc, ['packages', 'package.json'])
  if (!pkg) return

  const [owner, repo] = repoDoc.fullName.split('/')

  await createDefaultLabel({ installationId, owner, repo, name: config.label })

  const registry = RegClient()
  const registryGet = promisify(registry.get.bind(registry))
  const dependencyMeta = _.flatten(
    ['dependencies', 'devDependencies', 'optionalDependencies'].map(type => {
      return _.map(pkg[type], (version, name) => ({ name, version, type }))
    })
  )
  let dependencies = await Promise.mapSeries(dependencyMeta, async dep => {
    try {
      dep.data = await registryGet(registryUrl + dep.name.replace('/', '%2F'), {
      })
      return dep
    } catch (err) {}
  })

  dependencies = _(dependencies)
    .filter(Boolean)
    .map(dependency => {
      let latest = _.get(dependency, 'data.dist-tags.latest')
      if (_.includes(config.ignore, dependency.name)) return
      // neither version nor range, so it's something weird (git url)
      // better not touch it
      if (!semver.validRange(dependency.version)) return
      // new version is prerelease
      const oldIsPrerelease = _.get(
        semver.parse(dependency.version),
        'prerelease.length'
      ) > 0
      const prereleaseDiff = oldIsPrerelease &&
        semver.diff(dependency.version, latest) === 'prerelease'
      if (
        !prereleaseDiff &&
        _.get(semver.parse(latest), 'prerelease.length', 0) > 0
      ) {
        const versions = _.keys(_.get(dependency, 'data.versions'))
        latest = _.reduce(versions, function (current, next) {
          const parsed = semver.parse(next)
          if (!parsed) return current
          if (_.get(parsed, 'prerelease.length', 0) > 0) return current
          if (semver.gtr(next, current)) return next
          return current
        })
      }
      // no to need change anything :)
      if (semver.satisfies(latest, dependency.version)) return
      // no downgrades
      if (semver.ltr(latest, dependency.version)) return
      dependency.newVersion = getRangedVersion(latest, dependency.version)
      return dependency
    })
    .filter(Boolean)
    .value()

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo }))

  const branch = ghRepo.default_branch

  const newBranch = config.branchPrefix + 'initial'

  const slug = `${owner}/${repo}`
  const tokenHash = crypto
    .createHmac('sha256', env.BADGES_SECRET)
    .update(slug.toLowerCase())
    .digest('hex')
  const badgesTokenMaybe = repoDoc.private
    ? `?token=${tokenHash}&ts=${Date.now()}`
    : ''
  const badgeUrl = `https://badges.greenkeeper.io/${slug}.svg${badgesTokenMaybe}`

  const privateBadgeRegex = /https:\/\/badges\.(staging\.)?greenkeeper\.io\/.+?\.svg\?token=\w+(&ts=\d+)?/

  let badgeAlreadyAdded = false
  const transforms = [
    {
      path: 'package.json',
      message: 'chore(package): update dependencies',
      transform: oldPkg => {
        const oldPkgParsed = JSON.parse(oldPkg)
        const inplace = jsonInPlace(oldPkg)

        dependencies.forEach(({ type, name, newVersion }) => {
          if (!_.get(oldPkgParsed, [type, name])) return

          inplace.set([type, name], newVersion)
        })
        return inplace.toString()
      }
    },
    {
      path: '.travis.yml',
      message: 'chore(travis): whitelist greenkeeper branches',
      transform: raw => travisTransform(config, raw)
    },
    {
      path: '[README]',
      message: 'docs(readme): add Greenkeeper badge',
      transform: (readme, path) => {
        // TODO: empty readme, no image support
        const ext = extname(path).slice(1)
        if (!badger.hasImageSupport(ext)) return

        const hasPrivateBadge = privateBadgeRegex.test(readme)
        if (repoDoc.private && hasPrivateBadge) {
          return readme.replace(privateBadgeRegex, badgeUrl)
        }

        badgeAlreadyAdded = _.includes(
          readme,
          'https://badges.greenkeeper.io/'
        )
        if (!repoDoc.private && badgeAlreadyAdded) return

        return badger.addBadge(
          readme,
          ext,
          badgeUrl,
          'https://greenkeeper.io/',
          'Greenkeeper badge'
        )
      }
    }
  ]

  const sha = await createBranch({
    installationId,
    owner,
    repo,
    branch,
    newBranch,
    transforms
  })

  if (!sha) {
    // When there are no changes and the badge already exists we can enable right away
    if (badgeAlreadyAdded) {
      await upsert(repositories, repoDoc._id, { enabled: true })
      return maybeUpdatePaymentsJob(accountId, repoDoc.private)
    } else {
      throw new Error('Could not create initial branch')
    }
  }

  const depsUpdated = transforms[0].created
  const travisModified = transforms[1].created
  const badgeAdded = transforms[2].created

  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    initial: true,
    sha,
    base: branch,
    head: newBranch,
    processed: false,
    depsUpdated,
    travisModified,
    badgeAdded,
    badgeUrl
  })

  statsd.increment('initial_branch')

  return {
    delay: 15 * 60 * 1000,
    data: {
      name: 'initial-timeout-pr',
      repositoryId,
      accountId
    }
  }
}

async function createDefaultLabel ({ installationId, name, owner, repo }) {
  if (name !== false) {
    try {
      await githubQueue(installationId).write(github => github.issues.createLabel({
        owner,
        repo,
        name,
        color: '00c775'
      }))
    } catch (e) {}
  }
}

async function travisTransform (config, travisyml) {
  try {
    var travis = yaml.safeLoad(travisyml, {
      schema: yaml.FAILSAFE_SCHEMA
    })
  } catch (e) {
    // ignore .travis.yml if it can not be parsed
    return
  }
  const onlyBranches = _.get(travis, 'branches.only')
  if (!onlyBranches || !Array.isArray(onlyBranches)) return

  const greenkeeperRule = onlyBranches.some(function (branch) {
    if (_.first(branch) !== '/' || _.last(branch) !== '/') return false
    try {
      const regex = new RegExp(branch.slice(1, -1))
      return regex.test(config.branchPrefix)
    } catch (e) {
      return false
    }
  })
  if (greenkeeperRule) return

  return yamlInPlace.addToSequence(
    travisyml,
    ['branches', 'only'],
    `/^${escapeRegex(config.branchPrefix)}.*$/`
  )
}
