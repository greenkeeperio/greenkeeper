const _ = require('lodash')
const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const { createDocs } = require('../lib/repository-docs')

module.exports = async function ({ repositoryFullName }) {
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

  // delete all prdocs
  const prdocs = await repositories.allDocs({
    include_docs: true,
    startkey: `${repoDoc._id}:pr:`,
    endkey: `${repoDoc._id}:pr:\ufff0`,
    inclusive_end: true
  })

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

  const deleteBranchDocs = branches.rows.map(row => repositories.remove(row.doc))
  await Promise.all(deleteBranchDocs)

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
  return {
    data: {
      name: 'create-initial-branch',
      repositoryId: newRepoDoc._id,
      accountId
    }
  }
}
