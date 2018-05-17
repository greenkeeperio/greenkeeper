const crypto = require('crypto')
const { extname } = require('path')
const Log = require('gk-log')
const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const { promisify } = require('bluebird')
const badger = require('readme-badger')
const yaml = require('js-yaml')
const yamlInPlace = require('yml-in-place')
const escapeRegex = require('escape-string-regexp')
const RegClient = require('../lib/npm-registry-client')
const env = require('../lib/env')
const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const { discoverPackageFilePaths } = require('../lib/get-files')
const getMessage = require('../lib/get-message')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const { updateRepoDoc } = require('../lib/repository-docs')
const githubQueue = require('../lib/github-queue')
const { maybeUpdatePaymentsJob } = require('../lib/payments')
const upsert = require('../lib/upsert')
const { invalidConfigFile } = require('../lib/invalid-config-file')
const { getUpdatedDependenciesForFiles } = require('../utils/initial-branch-utils')

module.exports = async function ({ repositoryId, closes = [] }) {
  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const repoDoc = await repositories.get(repositoryId)
  const accountId = repoDoc.accountId
  const installation = await installations.get(accountId)
  const installationId = installation.installation
  const log = Log({logsDb: logs, accountId, repoSlug: repoDoc.fullName, context: 'create-initial-branch'})

  log.info('started')

  if (repoDoc.id === '135286129') return

  if (repoDoc.fork && !repoDoc.hasIssues) { // we should allways check if issues are disabled and exit
    log.warn('exited: Issues disabled on fork')
    return
  }

  let config = getConfig(repoDoc)
  log.info(`config for ${repoDoc.fullName}`, {config})
  if (config.disabled) {
    log.warn('exited: Greenkeeper is disabled for this repo in package.json')
    return
  }

  const [owner, repo] = repoDoc.fullName.split('/')
  const { default_branch: base } = await githubQueue(installationId).read(github => github.repos.get({ owner, repo }))
  // find all package.json files on the default branch
  const packageFilePaths = await discoverPackageFilePaths({installationId, fullName: repoDoc.fullName, defaultBranch: base, log})
  try {
    // This mutates repoDoc!
    // Also, this might fail, for example because of a `greenkeeper.json` validation issue, but all errors are handled
    // and the rest of this file will run anyway.
    await updateRepoDoc({installationId, doc: repoDoc, filePaths: packageFilePaths, log})
  } catch (e) {
    // If the config file is invalid, we open an issue instead of the initial PR
    if (e.name && e.name === 'GKConfigFileParseError') {
      log.warn('create initial branch failed because of an invalid config file')
      // We set a flag that the config was borked. When the next push for the greenkeeper.json comes and it is valid
      // we can tell by the flag whether we still need to open the initial PR that we didn’t do here.
      repoDoc.openInitialPRWhenConfigFileFixed = true
      return invalidConfigFile({
        repoDoc,
        config,
        repositories,
        // Danger: repository keys are snake_case, repoDoc are camelCase!
        // Handled in lib/invalid-config-file.js -> updateDoc()
        repository: repoDoc,
        repositoryId,
        details: [{ formattedMessage: e.message }],
        log,
        isBlockingInitialPR: true
      })
    }
  }

  // Get config again after updateRepoDoc, because it now has the package.json entries
  config = getConfig(repoDoc)

  // TODO: Test these two assertions
  if (!_.get(repoDoc, ['packages']) || Object.keys(repoDoc.packages).length === 0) {
    log.warn('exited: No packages or package.json files found')
    return
  }

  await upsert(repositories, repoDoc._id, repoDoc)

  const packageJsonContents = _.get(repoDoc, ['packages'])
  const packagePaths = _.keys(packageJsonContents)
  if (!_.get(repoDoc, ['packages']) || Object.keys(packageJsonContents).length === 0) return

  await createDefaultLabel({ installationId, owner, repo, name: config.label })

  const registry = RegClient()
  const registryGet = promisify(registry.get.bind(registry))

  // Get all package.jsons in this group and update every package the newest version
  const dependencies = await getUpdatedDependenciesForFiles({
    packagePaths,
    packageJsonContents,
    registryGet,
    ignore: _.get(config, 'ignore', []),
    log
  })

  const ghRepo = await githubQueue(installationId).read(github => github.repos.get({ owner, repo })) // wrap in try/catch
  log.info('github: repository info', {repositoryInfo: ghRepo})

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
  const badgeUrl = `https://${env.BADGES_HOST}/${slug}.svg${badgesTokenMaybe}`
  log.info('badge: url', {badgeUrl})

  const privateBadgeRegex = new RegExp(`https://${env.BADGES_HOST}.+?.svg\\?token=\\w+(&ts=\\d+)?`)

  let badgeAlreadyAdded = false

  // add greenkeeper.json if needed
  let transforms = [
    {
      path: '.travis.yml',
      message: getMessage(config.commitMessages, 'initialBranches'),
      transform: raw => travisTransform(config, raw)
    },
    {
      path: 'README.md',
      create: true,
      message: getMessage(config.commitMessages, 'initialBadge'),
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
          `https://${env.BADGES_HOST}/`
        )
        if (!repoDoc.private && badgeAlreadyAdded) {
          log.info('badge: Repository already has badge')
          return
        }

        return badger.addBadge(
          readme,
          ext,
          badgeUrl,
          `https://${env.GK_HOST}/`,
          'Greenkeeper badge'
        )
      }
    }
  ]
  let depsUpdated = false // this is ugly but works ¯\_(ツ)_/¯
  // create a transform loop for all the package.json paths and push into the transforms array below
  packagePaths.map((packagePath) => {
    transforms.unshift({
      path: packagePath,
      message: getMessage(config.commitMessages, 'initialDependencies'),
      transform: oldPkg => {
        const oldPkgParsed = JSON.parse(oldPkg)
        const inplace = jsonInPlace(oldPkg)

        dependencies.forEach(({ type, name, newVersion }) => {
          if (!_.get(oldPkgParsed, [type, name])) return
          depsUpdated = true
          inplace.set([type, name], newVersion)
        })
        return inplace.toString()
      }
    })
  })

  let greenkeeperConfigInfo = {
    isMonorepo: false
  }

  if ((packageFilePaths.length === 1 && packageFilePaths[0] === 'package.json') || packageFilePaths.length === 0) {
    // TODO: this should probably update an existing greenkeeper.json too, though.
    log.info('Not generating or updating greenkeeper.json: No package files in repo, or no monorepo.')
  } else {
    Object.assign(greenkeeperConfigInfo, {isMonorepo: true})
    log.info('Monorepo detected, generating greenkeeper config', {packageFilePaths})
    const greenkeeperConfigFile = repoDoc.greenkeeper || {}
    // Generate a default group with all the autodiscovered package.json files
    const defaultGroups = {
      default: {
        packages: packageFilePaths
      }
    }
    // Generate a new greenkeeeper.json from scratch
    let greenkeeperJSONTransform = {
      path: 'greenkeeper.json',
      message: getMessage(config.commitMessages, 'addConfigFile'),
      transform: () => {
        const greenkeeperJSON = {
          groups: defaultGroups
        }
        // greenkeeper.json must end with a newline
        return JSON.stringify(greenkeeperJSON, null, 2) + '\n'
      },
      create: true
    }
    greenkeeperConfigInfo.action = 'new'

    // if there already is a greenkeeper.json with some content, use that and update the groups object in the transform instead of generating a new one
    log.info('Checking greenkeeper.json config for groups', {
      hasGroups: !_.isEmpty(greenkeeperConfigFile.groups),
      greenkeeperConfigFile
    })
    if (!_.isEmpty(greenkeeperConfigFile.groups)) {
      const oldGreenkeeperConfigFile = _.cloneDeep(greenkeeperConfigFile)
      // mutates greenkeeperConfigFile & greenkeeperConfigInfo
      const updatedGreenkeeperConfigMeta = generateUpdatedGreenkeeperConfig({
        greenkeeperConfigFile,
        defaultGroups,
        packageFilePaths,
        greenkeeperConfigInfo
      })
      greenkeeperConfigInfo = updatedGreenkeeperConfigMeta.greenkeeperConfigInfo
      const updatedGreenkeeperConfigFile = updatedGreenkeeperConfigMeta.greenkeeperConfigFile
      log.info('updating existing greenkeeper config', {oldGreekeeperJson: oldGreenkeeperConfigFile, updatedGreenkeeperJson: updatedGreenkeeperConfigFile})
      // Replace the transform that generates the default group with one that updates existing groups
      greenkeeperJSONTransform.message = getMessage(config.commitMessages, 'updateConfigFile')
      greenkeeperJSONTransform.transform = () => {
        // greenkeeper.json must end with a newline
        return JSON.stringify(updatedGreenkeeperConfigFile, null, 2) + '\n'
      }
      // Don’t create this file because it already exists
      delete greenkeeperJSONTransform.create

      // set the updated greenkeeper config in the repoDoc
      await upsert(repositories, repoDoc._id, Object.assign(
        repoDoc,
        {greenkeeper: updatedGreenkeeperConfigFile}
      ))
    } else {
      // set the generated greenkeeper config in the repoDoc
      await upsert(repositories, repoDoc._id, Object.assign(
        repoDoc,
        {
          greenkeeper:
          {
            groups: defaultGroups
          }
        }
      ))
    }
    // add greenkeeper.json to the _beginning_ of the transforms array
    transforms.unshift(greenkeeperJSONTransform)
  }

  const sha = await createBranch({ // try/catch
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
      log.info('Repository silently enabled')
      if (env.IS_ENTERPRISE) {
        return
      } else {
        return maybeUpdatePaymentsJob(accountId, repoDoc.private)
      }
    } else {
      log.error('Could not create initial branch')
      throw new Error('Could not create initial branch')
    }
  }

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
    badgeUrl,
    greenkeeperConfigInfo,
    // If there are issues that should be closed by the initial PR message,
    // put them in the branch doc so we can find them later
    closes
  })

  statsd.increment('initial_branch')
  log.success('success')

  return {
    delay: 30 * 60 * 1000,
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

function generateUpdatedGreenkeeperConfig ({greenkeeperConfigFile, defaultGroups, packageFilePaths, greenkeeperConfigInfo}) {
  greenkeeperConfigInfo.deletedGroups = []
  greenkeeperConfigInfo.deletedPackageFiles = []
  const oldGroups = _.get(greenkeeperConfigFile, 'groups')
  // If no groups were defined in the old greenkeeper.json, add the default group we just generated
  let newGroups = defaultGroups
  // If there were groups defined, check every entry for whether the files referenced still exist
  if (oldGroups) {
    newGroups = {}
    _.map(oldGroups, (group, groupName) => {
      var result = {}
      result.packages = group.packages.filter((packagePath) => {
        if (packageFilePaths.indexOf(packagePath) === -1) {
          greenkeeperConfigInfo.deletedPackageFiles.push(packagePath)
          return false
        } else {
          return packagePath
        }
      })
      if (result.packages.length !== 0) {
        newGroups[groupName] = result
      } else {
        greenkeeperConfigInfo.deletedGroups.push(groupName)
      }
    })
    greenkeeperConfigInfo.action = 'updated'
  } else {
    greenkeeperConfigInfo.action = 'added-groups-only'
  }
  if (Object.keys(newGroups).length === 0) {
    // If there are no valid package files at all, remove the groups keys completely
    delete greenkeeperConfigFile.groups
  } else {
    greenkeeperConfigFile.groups = newGroups
  }
  return {greenkeeperConfigFile, greenkeeperConfigInfo}
}
