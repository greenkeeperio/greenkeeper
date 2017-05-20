const _ = require('lodash')

const dbs = require('../../lib/dbs')
const GitHub = require('../../lib/github')
const getToken = require('../../lib/get-token')
const handleBranchStatus = require('../../lib/handle-branch-status')

module.exports = async function ({ state, sha, repository, installation }) {
  // not a success or failure state
  if (!_.includes(['success', 'failure', 'error'], state)) return

  const { repositories } = await dbs()

  const [owner, repo] = repository.full_name.split('/')
  const accountId = String(repository.owner.id)
  const { token } = await getToken(installation.id)
  const github = GitHub()
  github.authenticate({ type: 'token', token })

  // not a success or failure state
  const combined = await github.repos.getCombinedStatus({
    owner,
    repo,
    ref: sha
  })
  if (!_.includes(['success', 'failure'], combined.state)) return

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

  if (branchDoc.initial) {
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

  await handleBranchStatus({
    github,
    branchDoc,
    accountId,
    repository,
    combined
  })
}
