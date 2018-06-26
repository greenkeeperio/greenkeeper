/*

# Handles GitHub Push Events

- Updates the DB if Greenkeeper-related files have changed.
- Closes no longer needed branches.
- Validates `greenkeeper.json` files and opens issues if needed.
- Disables repos if there’s no more package files
- Activates repos if new package files are added
- Bails if the repo has too many package files

## Callers:

webhooks

## Arguments:

data        :Object
  > The GitHub push event payload: https://developer.github.com/v3/activity/events/types/#pushevent

## Outputs/Effects:

*/

const assert = require('assert')

const Log = require('gk-log')

const dbs = require('../../lib/dbs')
const GKKit = require('../lib/gk-kit')
const GitHubKit = require('../lib/github-kit')

module.exports = async function (pushEventData) {
  let jobs = []
  const logs = dbs.getLogsDb()
  const push = GitHubKit(pushEventData.installation.id).pushes(pushEventData)
  const commits = push.getCommits()
  // decides whether to run at all:
  // - must have head commit
  // - must be default branch
  // - must concern gk-related files
  // - must not have too many package files
  // - must be a new change
  assert(push.hasHeadCommit(), 'No head commit')
  assert(push.isFromDefaultBranch(), 'Is not from default branch')
  assert(!push.hasTooManyPackageJSONs(), 'Event concerns too many package files')

  const gkKit = GKKit(pushEventData.repository.accountId)
  assert(gkKit.commitsConcernGreenkeeperFiles(commits), 'Does not change files we care about')
  // ⚠️ gkKit.repositories must check hasTooManyPackageJSONs() and throw if true + log
  const repo = gkKit.repositories(push.getRepositoryId())

  const log = Log({
    logsDb: logs,
    accountId: repo.getAccountId(),
    repoSlug: repo.getFullName(),
    context: 'push'
  })
  log.info('started')

  assert(!gkKit.isNewChange(push.getPushInfo()), 'already handled this change')

  // Set head_sha to `after` from event payload
  repo.setHeadSha(push.getPushInfo())

  // Validates up-to-date `greenkeeper.json` file from GitHub and opens issues if needed.
  const gkConfigFileFromGitHub = repo.config.fetch()
  if (gkKit.commitsConcernGreenkeeperConfigFile(commits)) {
    const validationResult = gkKit.config.validate(gkConfigFileFromGitHub)

    if (validationResult.hasErrors()) {
      log.warn('validation of greenkeeper.json failed', {
        error: validationResult.getFormattedErrorMessages(), greenkeeperJson: gkConfigFileFromGitHub
      })
      // open issue
      jobs.push(repo.createJob({
        name: 'invalid-config-file',
        messages: validationResult.getFormattedErrorMessages(),
        isBlockingInitialPR: false
      })
      )
    }
  } else {
    jobs.push(repo.createInitialBranchJobAfterConfigFileFix())
    /*
    // Config file is valid, close any open issues concerning invalid config files
    const issueNumberToClose = repo.issues.getInvalidConfigIssueNumber()
    if (repoDoc.openInitialPRWhenConfigFileFixed) {
    // reset the flag
    delete repoDoc.openInitialPRWhenConfigFileFixed
    // If the config is valid and we had previously bailed on an initial branch because it wasn’t, create that branch now.
    return createJob({
      name: 'create-initial-branch',
      closes: [issueToClose]
    })
    */
  }

  // Close no longer needed branches.
  const changedPackageFilesFromGitHub = push.fetchChangedPackageFileContents()
  repo.cleanUpBranches({
    gkConfigFileFromGitHub,
    changedPackageFilesFromGitHub
  })

  // TODO: autodiscover and disable repo if no package files
  // repo.fetchPackageFiles() calls repo.fetchPackageFilePaths()
  // repo.disableIfNoPackageFiles() also calls repo.fetchPackageFilePaths()

  // Disable repo if there’s no more package files
  repo.disableIfNoPackageFiles()

  // Create new initial branch if repo now has package files
  // Activate repo if new package files are added
  if (!repo.hasExistingPackageFiles()) {
    log.success('starting create-initial-branch')
    jobs.push(repo.createJob({
      name: 'create-initial-branch'
    }))
  }

  if (repo.shouldCreateInitialSubgroupBranches()) {
    jobs = jobs.concat(repo.createInitialSubgroupBranches())
  }

  // Updates the DB
  repo.save()
  log.success('success')
  return jobs
}
