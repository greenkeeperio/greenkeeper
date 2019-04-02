const onBranchStatus = require('../../lib/on-branch-status')

module.exports = async function ({ state, sha, repository, installation }) {
  // not a success or failure state
  if (!['success', 'failure', 'error'].includes(state)) return
  return onBranchStatus(repository, sha, installation)
}
