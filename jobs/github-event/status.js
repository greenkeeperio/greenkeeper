const _ = require('lodash')

const dbs = require('../../lib/dbs')
const GithubQueue = require('../../lib/github-queue')
const handleBranchStatus = require('../../lib/handle-branch-status')

module.exports = async function ({ state, sha, repository, installation }) {
  // not a success or failure state
  if (!_.includes(['success', 'failure', 'error'], state)) return

  const { repositories } = await dbs()

  const [owner, repo] = repository.full_name.split('/')
  const accountId = String(repository.owner.id)
  const installationId = installation.id
  // not a success or failure state
  const combined = await GithubQueue(installationId).read(github => github.repos.getCombinedStatusForRef({
    owner,
    repo,
    ref: sha
  }))
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
