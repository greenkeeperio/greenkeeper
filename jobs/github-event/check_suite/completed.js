/*

jobs/github-event/check_suite/completed.js

Receives webhook events for when a check suite is completed.
Docs: https://developer.github.com/v3/activity/events/types/#checksuiteevent

This is the handler for the`completed` action.

*/

const onBranchStatus = require('../../../lib/on-branch-status')

module.exports = async function ({ check_suite, repository, installation }) { // eslint-disable-line
  const { status, conclusion, head_sha } = check_suite // eslint-disable-line
  // This shouldn’t be possible, since this is the completed event handler, but hey.
  if (status !== 'completed') return
  // The status of this particular check_suite is inconclusive (we can’t say whether the
  // build is passing or failing), so there’s no point in continuing
  if (['cancelled', 'timed_out', 'action_required'].includes(conclusion)) return
  return onBranchStatus(repository, head_sha, installation)
}
