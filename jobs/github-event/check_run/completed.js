/*

jobs/github-event/check_run/completed.js

Receives webhook events for when a check run is completed.
Docs: https://developer.github.com/v3/activity/events/types/#checkrunevent

This is the handler for the`completed` action, which according to the docs doesn’t exist for this endpoint, but according to reality actually does.
*/

const onBranchStatus = require('../../../lib/on-branch-status')

module.exports = async function ({ check_run, repository, installation }) { // eslint-disable-line
  const { status, conclusion, head_sha } = check_run // eslint-disable-line
  // This shouldn’t be possible, since this is the completed event handler, but hey.
  if (status !== 'completed') return
  return onBranchStatus(repository, head_sha, installation)
}
