const Log = require('gk-log')
const _ = require('lodash')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const { createDocs } = require('../lib/repository-docs')

module.exports = async function ({ repositoryFullName }) {
  repositoryFullName = repositoryFullName.toLowerCase()
  // find the repository in the database
  const { repositories, installations } = await dbs()
  const repoDoc = _.get(
    await repositories.query('by_full_name', {
      key: repositoryFullName,
      include_docs: true
    }),
    'rows[0].doc'
  )

  if (!repoDoc) {
    const error = new Error(`The repository ${repositoryFullName} does not exist in the database`)
    error.status = 404
    throw error
  }

  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: repoDoc.accountId, repoSlug: repoDoc.fullName, context: 'reset' })
  log.info(`started reset`)

  // delete all prdocs
  const prdocs = await repositories.allDocs({
    include_docs: true,
    startkey: `${repoDoc._id}:pr:`,
    endkey: `${repoDoc._id}:pr:\ufff0`,
    inclusive_end: true
  })

  log.info(`started deleting ${prdocs.rows.length} PR docs`)
  const deletePrDocs = prdocs.rows.map(row => repositories.remove(row.doc))
  await Promise.all(deletePrDocs)

  // delete all greenkeeper branches in the repository
  const branches = await repositories.allDocs({
    include_docs: true,
    startkey: `${repoDoc._id}:branch:`,
    endkey: `${repoDoc._id}:branch:\ufff0`,
    inclusive_end: true
  })
  const [owner, repo] = repositoryFullName.split('/')
  const accountId = String(repoDoc.accountId)
  const accountDoc = await installations.get(accountId)
  const installationId = accountDoc.installation
  const ghqueue = githubQueue(installationId)
  log.info(`started deleting ${branches.rows.length} branches`)
  for (let row of branches.rows) {
    const branch = row.doc
    try {
      await ghqueue.write(github => github.gitdata.deleteReference({
        owner,
        repo,
        ref: `heads/${branch.head}`
      }))
    } catch (e) {
      // branch was deleted already and since we wanted to delete it anyway, we're cool
      // with this error
      if (e.code === 422) {
        continue
      }
      if (branch.head === 'greenkeeper/initial' || branch.head === 'greenkeeper-initial') {
        throw e
      }
    }
  }

  log.info(`started deleting ${branches.rows.length} branch docs`)
  const deleteBranchDocs = branches.rows.map(row => repositories.remove(row.doc))
  await Promise.all(deleteBranchDocs)

  // close all greenkeeper issues in the repository and delete all issues in the database
  const issues = await repositories.allDocs({
    include_docs: true,
    startkey: `${repoDoc._id}:issue:`,
    endkey: `${repoDoc._id}:issue:\ufff0`,
    inclusive_end: true
  })

  log.info(`started closing ${issues.rows.length} issues`)
  for (let row of issues.rows) {
    const issue = row.doc
    if (issue.state === 'closed') {
      continue
    }
    try {
      await ghqueue.write(github => github.issues.edit({
        owner,
        repo,
        number: issue.number,
        state: 'closed'
      }))
    } catch (e) {
      if (e.code !== 404) {
        throw e
      }
    }
  }

  log.info(`started deleting ${issues.rows.length} issue docs`)
  const deleteIssueDocs = issues.rows.map(row => repositories.remove(row.doc))
  await Promise.all(deleteIssueDocs)

  // get the current repository state from github
  // to get the newest repo settings (e.g. user enabled issues in the mean time)
  const githubRepository = await ghqueue.read(github => github.repos.get({ owner, repo }))

  await repositories.remove(repoDoc)
  await repositories.bulkDocs(createDocs({
    repositories: [githubRepository],
    accountId
  }))

  // enqueue create initial branch job
  const newRepoDoc = await repositories.get(githubRepository.id)
  log.success(`Clean-up and new repoDoc complete, queuing up create-initial-branch…`, {
    name: 'create-initial-branch',
    repositoryId: newRepoDoc._id,
    accountId
  })
  return {
    data: {
      name: 'create-initial-branch',
      repositoryId: newRepoDoc._id,
      accountId
    }
  }
}
