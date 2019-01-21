const Log = require('gk-log')
const _ = require('lodash')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const { createDocs } = require('../lib/repository-docs')

module.exports = async function ({ repositoryFullName, accountId }) {
  repositoryFullName = repositoryFullName.toLowerCase()
  const { repositories, installations } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: accountId, repoSlug: repositoryFullName, context: 'reset' })
  log.info(`started reset`)

  let repoDoc = ''
  let eventuallyAccountId
  try {
    // find the repository in the database
    repoDoc = _.get(
      await repositories.query('by_full_name', {
        key: repositoryFullName,
        include_docs: true
      }),
      'rows[0].doc'
    )
    eventuallyAccountId = repoDoc.accountId
  } catch (error) {
    log.info(`The repository ${repositoryFullName} does not exist in the database`)
  }

  const [owner, repo] = repositoryFullName.split('/')
  if (!repoDoc) {
    let exampleRepo = ''
    try {
      exampleRepo = (await repositories.query('repo-by-org', {
        key: owner,
        limit: 1,
        include_docs: true
      })).rows[0].doc
    } catch (error) {
      log.warn('Could not get repo for user', error)
    }

    eventuallyAccountId = exampleRepo.accountId || accountId

    if (!eventuallyAccountId) {
      log.warn('exited: Cannot create temporary repository. Missing accountId')
      return
    }
    try {
      // create temporary repo
      await repositories.put({
        '_id': `tmp-${owner}-${repo}`,
        'type': 'repository',
        'accountId': eventuallyAccountId,
        'fullName': repositoryFullName,
        'enabled': false
      })
      repoDoc = await repositories.get(`tmp-${owner}-${repo}`)
    } catch (error) {
      console.warn(`Failed to create temporary repo for ${repositoryFullName}`, { error: error.message })
    }
  } else {
    // found an existing RepoDoc and delete all the stuff
    await deleteAllTheThings({ repositories, installations, repoDoc, log, owner, repo })
  }

  // get the current repository state from github
  // to get the newest repo settings (e.g. user enabled issues in the mean time)
  let githubRepository
  const accountDoc = await installations.get(String(eventuallyAccountId))
  const installationId = accountDoc.installation
  const ghqueue = githubQueue(installationId)
  try {
    githubRepository = await ghqueue.read(github => github.repos.get({ owner, repo }))
  } catch (error) {
    log.warn('Failed to get repo from GitHub', { error: error.message })
  }

  try {
    await repositories.remove(repoDoc)
    await repositories.bulkDocs(createDocs({
      repositories: [githubRepository],
      accountId: eventuallyAccountId
    }))
  } catch (error) {
    log.warn('Failed to remove or create a repoDoc', { error: error.message })
  }

  if (githubRepository) {
    // enqueue create initial branch job
    const newRepoDoc = await repositories.get(githubRepository.id)
    log.success(`Clean-up and new repoDoc complete, queuing up create-initial-branch…`, {
      name: 'create-initial-branch',
      repositoryId: newRepoDoc._id,
      accountId: eventuallyAccountId
    })
    return {
      data: {
        name: 'create-initial-branch',
        repositoryId: newRepoDoc._id,
        accountId: eventuallyAccountId
      }
    }
  }
}

const deleteAllTheThings = async ({ repositories, installations, repoDoc, owner, repo, log }) => {
  // delete all prDocs
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
  const accountDoc = await installations.get(String(repoDoc.accountId))
  const installationId = accountDoc.installation
  const ghqueue = githubQueue(installationId)
  log.info(`started deleting ${branches.rows.length} branches`)
  for (let row of branches.rows) {
    const branch = row.doc
    try {
      await ghqueue.write(github => github.gitdata.deleteRef({
        owner,
        repo,
        ref: `heads/${branch.head}`
      }))
    } catch (e) {
    // branch was deleted already and since we wanted to delete it anyway, we're cool
    // with this error
      if (e.status === 422) {
        continue
      }
      if (branch.head === 'greenkeeper/initial' || branch.head === 'greenkeeper-initial') {
        throw e
      }
    }
  }

  log.info(`started deleting ${branches.rows.length} branch docs`)
  const deleteBranchDocs = branches.rows.map(row => repositories.remove(row.doc))

  try {
    await Promise.all(deleteBranchDocs)
  } catch (error) {
    log.warn('failed to delete branchDocs', { error: error.message })
  }

  // close all greenkeeper issues in the repository and delete all issues in the database
  const issues = await repositories.allDocs({
    include_docs: true,
    startkey: `${repoDoc._id}:issue:`,
    endkey: `${repoDoc._id}:issue:\ufff0`,
    inclusive_end: true
  })
  const openIssues = issues.rows.filter(issue => issue.doc.state !== 'closed')
  log.info(`Started closing ${openIssues.length} open issues`, { issues: openIssues })

  for (let issue of openIssues) {
    try {
      await ghqueue.write(github => github.issues.update({
        owner,
        repo,
        number: issue.doc.number,
        state: 'closed'
      }))
    } catch (error) {
      if (error.status !== 404) {
        throw error
      }
      log.warn('Could not close issues', { error: error.message })
    }
  }

  log.info(`Started deleting ${issues.rows.length} issue docs`)
  const deleteIssueDocs = issues.rows.map(row => repositories.remove(row.doc))
  try {
    await Promise.all(deleteIssueDocs)
  } catch (error) {
    log.warn('Failed to delete issueDocs', { error: error.message })
  }
}
