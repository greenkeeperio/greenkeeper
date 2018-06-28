const _ = require('lodash')
const onBranchStatus = require('../../lib/on-branch-status')

module.exports = async function ({ state, sha, repository, installation }) {
  // not a success or failure state
  if (!_.includes(['success', 'failure', 'error'], state)) return
  return onBranchStatus(repository, sha, installation)
}
