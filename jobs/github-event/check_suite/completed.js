/*

jobs/github-event/check_run/completed.js

Receives webhook events for when a check suite is completed.

*/

const _ = require('lodash')
const onBranchStatus = require('../../../lib/on-branch-status')

module.exports = async function ({ status, conclusion, head_sha, repository, installation }) { // eslint-disable-line
  // This shouldn’t be possible, since this is the completed event handler, but hey.
  if (status !== 'completed') return
  // The status of this particular check_suite is inconclusive (we can’t say whether the
  // build is passing or failing), so there’s no point in continuing
  if (_.includes(['cancelled', 'timed_out', 'action_required'], status)) return
  return onBranchStatus(repository, head_sha, installation)
}
