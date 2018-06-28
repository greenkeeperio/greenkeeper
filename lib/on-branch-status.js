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

module.exports = async function (repository, sha, installation) {
  const { repositories } = await dbs()

  const [owner, repo] = repository.full_name.split('/')
  const accountId = String(repository.owner.id)
  const installationId = installation.id

  /* 1. Get combined state of all statuses for this branch
  https://developer.github.com/v3/repos/statuses/#get-the-combined-status-for-a-specific-ref

  `combined.state` is one of:

  - `failure` if any of the contexts report as `error` or `failure`
  - `pending` if there are no statuses or a context is `pending`
  - `success` if the latest status for all contexts is `success`

  Note that there may be no statuses, only checks, in this case, GitHub returns:

  "state": "pending",
  "statuses": [],
  …

  Since `status.js` only calls this code if the state is one of 'success', 'failure', 'error', we can be certain
  that it’s actually _not_ pending, but that there are no statuses at all.
  */
  const combined = await GithubQueue(installationId).read(github => github.repos.getCombinedStatusForRef({
    owner,
    repo,
    ref: sha
  }))
  if (combined.state === 'pending' && combined.statuses.length === 0) {
    combined.state = 'success'
    // this is fine, this means that there are no statuses on the repo at all, but there
    // should be checks (otherwise we wouldn’t be in this file)
  } else {
    // We _do_ continue on failure since the `handleBranchStatus` job can also
    // comment with notifications about failing builds.
    if (!_.includes(['success', 'failure'], combined.state)) return
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

  const allCheckRuns = await GithubQueue(installationId).read(github => github.checks.listForRef({
    owner,
    repo,
    ref: sha
  }))

  // If there are no check runs, don’t try to do anything with them
  if (allCheckRuns.total_count !== 0) {
    // Collect the conclusions of all completed runs in a handy array
    const checkRunConclusions = _.compact(allCheckRuns.check_runs.map((checkRun) => {
      combined.statuses.push({
        state: checkRun.conclusion,
        context: checkRun.name,
        description: checkRun.output.summary
      })
      return checkRun.status === 'completed' && checkRun.conclusion
    }))

    // If there are fewer conclusions than total runs, some are incomplete/pending
    // and we can’t continue
    if (checkRunConclusions.length !== allCheckRuns.total_count) return

    // If the collected conclusions contain `cancelled`, `timed_out`, or `action_required`, we
    // can’t really know what to do, so we bail as well. It’s probable that the check will re-run
    // either automatically or by user action later, and at some point all conclusions should be one of
    // `success`, `failure`, or `neutral`, which we can work with.
    const undesirableConclusions = ['cancelled', 'timed_out', 'action_required']
    if (_.intersection(checkRunConclusions, undesirableConclusions).length) return

    if (checkRunConclusions.includes('failure')) {
      combined.state = 'failure'
    }
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
  if (branchDoc.processed) return
  // state did not change
  if (branchDoc.state === combined.state) return
  // branch is for a node update or deprecation (we just open an issue, no PR)
  if (branchDoc.head) {
    const skippableBranches = ['update-to-node-', 'deprecate-node-']
    const skipBranch = !!skippableBranches.find((skippable) => {
      return branchDoc.head.match(RegExp(skippable, 'i'))
    })
    if (skipBranch) return
  }

  if (branchDoc.initial) {
    const result = await repositories.allDocs({
      include_docs: true,
      descending: true,
      startkey: `${repository.id}:pr:\uffff`,
      endkey: `${repository.id}:pr:`
    })
    const initialRow = result.rows.find((row) => {
      return row.doc.initial && row.doc.createdByUser
    })

    if (initialRow) {
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
