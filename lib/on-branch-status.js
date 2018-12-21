/*

Helper that runs when the status or a check of a branch has changed/completed.

Every time a succesful branch status or check event arrives from GitHub, we want to see whether
all checks and statuses are completed AND successful (or neutral). If they are, we can proceed
with opening PRs or commenting on open ones.

This file queries both the status and checks APIs on GitHub and then acts upon the combined results.

## Arguments

- repository:Object
  > As included in the GitHub event payload
- sha:String
  > commit sha that describes the branch we’re interested in
- installation:Object
  > As included in the GitHub event payload

*/

const _ = require('lodash')

const dbs = require('./dbs')
const GithubQueue = require('./github-queue')
const handleBranchStatus = require('./handle-branch-status')
const statsd = require('./statsd')

const Log = require('gk-log')

module.exports = async function (repository, sha, installation) {
  const { repositories } = await dbs()

  const [owner, repo] = repository.full_name.split('/')
  const accountId = String(repository.owner.id)
  // If the event handler passes in an onstallation object, use that, otherwise, get the installationId from the db
  // because, docs: "payloads [...] for a GitHub App's webhook may (!!!) include the installation which an event relates to"
  // cf. https://developer.github.com/webhooks/
  let installationId
  if (installation && installation.id) {
    installationId = installation.id
  } else {
    const { installations } = await dbs()
    const installation = await installations.get(accountId)
    installationId = installation.installation
  }

  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId, repoSlug: repository.full_name, context: 'on-branch-status' })
  log.info('Received branch status')
  /* 1. Get all statuses for this branch
  https://developer.github.com/v3/repos/statuses/#list-statuses-for-a-specific-ref
  (getStatuses) in our version of Octokit
  */
  let combined = {
    statuses: [],
    state: undefined
  }
  combined.statuses = await GithubQueue(installationId).read(github => github.repos.getStatuses({
    owner,
    repo,
    ref: sha
  }))

  if (combined.statuses.length > 0) {
    const hasPendingStatuses = combined.statuses.find(status => status.state === 'pending')
    if (hasPendingStatuses) {
      log.warn('Has pending statuses, bailing.', { combined })
      return
    }
    const hasFailingStatuses = combined.statuses.find(status => status.state === 'failure' || status.state === 'error')
    if (hasFailingStatuses) {
      combined.state = 'failure'
    } else {
      combined.state = 'success'
    }
    log.info(`After all statuses completed, combined state set to ${combined.state}`, { combined })
  } else {
    log.info('No statuses, continuing with checks.')
  }

  /* 2. Get the combined Checks for this branch

  Takes the same args as the previous GitHub call, but fetches all checks for the ref. Returns an
  object with an array of check_run objects under response.check_runs, each of which has a `conclusion`
  key that can be either `success`, `failure`, `neutral`, `cancelled`, `timed_out`, or `action_required`.

  If no check runs exist, returns:

  {
    "total_count": 0,
    "check_runs": [

    ]
  }

  */

  let allCheckRuns = {}
  // We may not have permission to check the checks API
  try {
    allCheckRuns = await GithubQueue(installationId).read(github => github.checks.listForRef({
      owner,
      repo,
      ref: sha
    }))
  } catch (e) {
    // Fail silently and log if we don’t have permission
    statsd.increment('no-checks-permission')
    log.warn('No permission for Checks API', { e })
  }
  log.info('Got check runs', { allCheckRuns })
  // If there are no check runs, don’t try to do anything with them
  if (allCheckRuns && allCheckRuns.check_runs && allCheckRuns.total_count !== 0) {
    // Collect the conclusions of all completed runs in a handy array
    const checkRunConclusions = _.compact(allCheckRuns.check_runs.map((checkRun) => {
      // We use the combined statuses array to store these checks as well
      combined.statuses.push({
        state: checkRun.conclusion,
        context: checkRun.name,
        description: checkRun.output.summary
      })
      return checkRun.status === 'completed' && checkRun.conclusion
    }))

    // If there are fewer conclusions than total runs, some are incomplete/pending
    // and we can’t continue
    // ⚠️  allCheckRuns.total_count IS NOT necessarily the total count of all check runs! It’s the total count
    // at this moment in time.
    if (checkRunConclusions.length !== allCheckRuns.total_count) {
      log.warn(`Bailed because check runs are incomplete (${checkRunConclusions.length}/${allCheckRuns.total_count})`)
      return
    }

    // If all checkruns are a success or neutral, set combinedState to `success`, else `failure`
    // This casts all failure conclusions (`cancelled`, `timed_out`, `action_required`, `failure`)
    // as `failure`
    const failureConclusions = ['cancelled', 'timed_out', 'action_required', 'failure']
    const hasFailureConclusions = !!_.intersection(checkRunConclusions, failureConclusions).length
    if (hasFailureConclusions) {
      combined.state = 'failure'
    } else {
      combined.state = 'success'
    }
    log.info(`Combined state set to ${combined.state}`, { checkRunConclusions })
  } else {
    log.warn('No check runs found', { allCheckRuns })
  }

  const branchDoc = _.get(
    await repositories.query('by_branch_sha', {
      key: sha,
      include_docs: true
    }),
    'rows[0].doc'
  )
  // branch was not created by Greenkeeper
  if (!branchDoc) return
  // branch already processed
  if (branchDoc.processed) {
    log.info('exited: branch already processed.')
    return
  }
  // state did not change
  if (branchDoc.state === combined.state) {
    log.info('state did not change.')
    return
  }
  // branch is for a node update or deprecation (we just open an issue, no PR)
  if (branchDoc.head) {
    const skippableBranches = ['update-to-node-', 'deprecate-node-']
    const skipBranch = !!skippableBranches.find((skippable) => {
      return branchDoc.head.match(RegExp(skippable, 'i'))
    })
    if (skipBranch) return
  }

  if (branchDoc.initial) {
    let result = []
    try {
      result = await repositories.allDocs({
        include_docs: true,
        descending: true,
        startkey: `${repository.id}:pr:\uffff`,
        endkey: `${repository.id}:pr:`
      })
    } catch (error) {
      log.error('could not get repositories', { error: error.message })
    }

    const initialRow = result.rows.find((row) => {
      return row.doc.initial && row.doc.createdByUser
    })

    if (initialRow) {
      log.info('start to create initial pr-comment')
      return {
        data: {
          name: 'create-initial-pr-comment',
          accountId,
          branchDoc,
          prDocId: initialRow.doc._id,
          repository,
          combined,
          installationId: installation.id
        }
      }
    }

    log.info('start to create initial pr')
    return {
      data: {
        name: 'create-initial-pr',
        accountId,
        branchDoc,
        repository,
        combined,
        installationId: installation.id
      }
    }
  }

  if (branchDoc.subgroupInitial) {
    const result = await repositories.allDocs({
      include_docs: true,
      descending: true,
      startkey: `${repository.id}:pr:\uffff`,
      endkey: `${repository.id}:pr:`
    })
    const initialRow = result.rows.find((row) => {
      return row.doc.subgroupInitial && row.doc.createdByUser
    })

    // the branch head looks like this: 'greenkeeper/initial-frontend'
    // we need the group name
    const groupName = branchDoc.head.split('initial-')[1]

    if (initialRow) {
      log.info('start to create initial subgroup pr-comment')
      return {
        data: {
          name: 'create-initial-subgroup-pr-comment',
          accountId,
          branchDoc,
          prDocId: initialRow.doc._id,
          repository,
          combined,
          installationId: installation.id,
          groupName
        }
      }
    }

    log.info('start to create initial subgroup pr')
    return {
      data: {
        name: 'create-initial-subgroup-pr',
        accountId,
        branchDoc,
        repository,
        combined,
        installationId: installation.id,
        groupName
      }
    }
  }

  await handleBranchStatus({
    installationId,
    branchDoc,
    accountId,
    repository,
    combined
  })
}
