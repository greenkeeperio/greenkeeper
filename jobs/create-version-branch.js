const _ = require('lodash')
const jsonInPlace = require('json-in-place')
const semver = require('semver')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const getConfig = require('../lib/get-config')
const getInfos = require('../lib/get-infos')
const getRangedVersion = require('../lib/get-ranged-version')
const createBranch = require('../lib/create-branch')
const statsd = require('../lib/statsd')
const env = require('../lib/env')
const githubQueue = require('../lib/github-queue')
const upsert = require('../lib/upsert')
const { getActiveBilling, getAccountNeedsMarketplaceUpgrade } = require('../lib/payments')

const prContent = require('../content/update-pr')

module.exports = async function (
  {
    dependency,
    accountId,
    repositoryId,
    type,
    distTag,
    distTags,
    oldVersion,
    oldVersionResolved,
    versions
  }
) {
  // TODO: correctly handle beta versions, and hotfixes
  if (distTag !== 'latest') return
  // do not upgrade invalid versions
  if (!semver.validRange(oldVersion)) return

  const version = distTags[distTag]
  const { installations, repositories, logs } = await dbs()
  const installation = await installations.get(accountId)
  const repository = await repositories.get(repositoryId)
  const log = Log({logsDb: logs, accountId, repoSlug: repository.fullName, context: 'create-version-branch'})
  log.info('started', {dependency, type, version, oldVersion})
  const satisfies = semver.satisfies(version, oldVersion)
  const lockFiles = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock']
  const hasLockFile = _.some(_.pick(repository.files, lockFiles))
  if (satisfies && hasLockFile) {
    log.info('exited: dependency satisfies semver & repository has a lockfile')
    return
  }

  const billing = await getActiveBilling(accountId)
  if (repository.private && (!billing || await getAccountNeedsMarketplaceUpgrade(accountId))) {
    log.warn('exited: payment required')
    return
  }

  const [owner, repo] = repository.fullName.split('/')
  const config = getConfig(repository)
  if (_.includes(config.ignore, dependency)) {
    log.warn('exited: dependency ignored')
    return
  }
  const installationId = installation.installation
  const ghqueue = githubQueue(installationId)
  const { default_branch: base } = await ghqueue.read(github => github.repos.get({ owner, repo }))
  log.info('github: found default branch', {defaultBranch: base})

  const newBranch = `${config.branchPrefix}${dependency}-${version}`
  log.info('branch name created', {branchName: newBranch})

  function transform (pkg) {
    try {
      var json = JSON.parse(pkg)
      var parsed = jsonInPlace(pkg)
    } catch (e) {
      return // ignore parse errors
    }

    const oldPkgVersion = _.get(json, [type, dependency])
    if (!oldPkgVersion) {
      log.warn('exited: could not find old package version')
      return
    }

    if (semver.ltr(version, oldPkgVersion)) { // no downgrades
      log.warn('exited: would be a downgrade', {newVersion: version, oldVersion: oldPkgVersion})
      return
    }

    parsed.set([type, dependency], getRangedVersion(version, oldPkgVersion))
    return parsed.toString()
  }

  const openPR = _.get(
    await repositories.query('pr_open_by_dependency', {
      key: [repositoryId, dependency],
      include_docs: true
    }),
    'rows[0].doc'
  )
  log.info('database: found open PR for this dependency', {openPR})

  const commitMessageScope = !satisfies && type === 'dependencies'
    ? 'fix'
    : 'chore'
  let commitMessage = `${commitMessageScope}(package): update ${dependency} to version ${version}`

  if (!satisfies && openPR) {
    await upsert(repositories, openPR._id, {
      comments: [...(openPR.comments || []), version]
    })

    commitMessage += `\n\nCloses #${openPR.number}`
  }
  log.info('commit message created', {commitMessage})

  const sha = await createBranch({
    installationId,
    owner,
    repo,
    branch: base,
    newBranch,
    path: 'package.json',
    transform,
    message: commitMessage
  })
  if (sha) {
    log.success('github: branch created', {sha})
  }

  if (!sha) { // no branch was created
    log.error('github: no branch was created')
    return
  }

  // TODO: previously we checked the default_branch's status
  // this failed when users used [ci skip]
  // or the repo was freshly set up
  // the commit didn't have a status then
  // https://github.com/greenkeeperio/greenkeeper/issues/59
  // new strategy: we just don't do anything for now
  // in the future we can check at this very moment
  // how many unprocessed branches are lying around
  // and create an issue telling the user to enable CI

  await upsert(repositories, `${repositoryId}:branch:${sha}`, {
    type: 'branch',
    sha,
    base,
    head: newBranch,
    dependency,
    version,
    oldVersion,
    oldVersionResolved,
    dependencyType: type,
    repositoryId,
    accountId,
    processed: !satisfies
  })

  // nothing to do anymore
  // the next action will be triggered by the status event
  if (satisfies) {
    log.info('dependency satisfies version range')
    return
  }

  const diffBase = openPR
    ? _.get(openPR, 'comments.length')
        ? _.last(openPR.comments)
        : openPR.version
    : oldVersionResolved

  const { dependencyLink, release, diffCommits } = await getInfos({
    installationId,
    dependency,
    version,
    diffBase,
    versions
  })

  const bodyDetails = _.compact(['\n', release, diffCommits]).join('\n')

  if (openPR) {
    await ghqueue.write(github => github.issues.createComment({
      owner,
      repo,
      number: openPR.number,
      body: `## Version **${version}** just got published. \n[Update to this version instead 🚀](${env.GITHUB_URL}/${owner}/${repo}/compare/${encodeURIComponent(newBranch)}?expand=1) ${bodyDetails}`
    }))

    statsd.increment('pullrequest_comments')
    log.info('github: commented on already open PR for that dependency')
    return
  }

  const title = `Update ${dependency} to the latest version 🚀`

  const plan = _.get(billing, 'plan', 'free')

  const body = prContent({
    dependencyLink,
    oldVersionResolved,
    version,
    dependency,
    type,
    release,
    diffCommits,
    plan,
    isPrivate: repository.private
  })

  // verify pull requests commit
  log.info('github: set greenkeeper/verify status')
  await ghqueue.write(github => github.repos.createStatus({
    sha,
    owner,
    repo,
    state: 'success',
    context: 'greenkeeper/verify',
    description: 'Greenkeeper verified pull request',
    target_url: 'https://greenkeeper.io/verify.html'
  }))

  const createdPr = await createPr({
    ghqueue,
    title,
    body,
    base,
    head: newBranch,
    owner,
    repo,
    log
  })

  if (createdPr) {
    log.success('github: pull request created', {pullRequest: createdPr})
  }
  if (!createdPr) {
    log.error('github: pull request was not created')
    return
  }

  statsd.increment('update_pullrequests')

  await upsert(repositories, `${repositoryId}:pr:${createdPr.id}`, {
    type: 'pr',
    repositoryId,
    accountId,
    version,
    oldVersion,
    dependency,
    initial: false,
    merged: false,
    number: createdPr.number,
    state: createdPr.state
  })

  if (config.label !== false) {
    await ghqueue.write(github => github.issues.addLabels({
      number: createdPr.number,
      labels: [config.label],
      owner,
      repo
    }))
  }
}

async function createPr ({ ghqueue, title, body, base, head, owner, repo, log }) {
  try {
    return await ghqueue.write(github => github.pullRequests.create({
      title,
      body,
      base,
      head,
      owner,
      repo
    }))
  } catch (err) {
    if (err.code !== 422) throw err
    const allPrs = await ghqueue.read(github => github.pullRequests.getAll({
      base,
      head: owner + ':' + head,
      owner,
      repo
    }))

    if (allPrs.length > 0) {
      log.warn('queue: retry sending pull request to github')
      return allPrs.shift()
    }
  }
}
