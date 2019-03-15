const redis = require('redis')
const { promisify } = require('bluebird')
const Log = require('gk-log')

const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const { createDocs } = require('../lib/repository-docs')

module.exports = async function ({ accountId }) {
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: accountId, repoSlug: null, context: 'sync-repositories' })
  log.info(`started`)

  const { installations, repositories } = await dbs()
  const installation = await installations.get(String(accountId))
  const installationId = installation.installation

  let dbRepos
  let gitHubRepos
  let accountName
  try {
    const { rows: currentRepos } = await repositories.query('repo-by-org/repo-by-org', {
      key: 'neighbourhoodie',
      reduce: false,
      include_docs: true
    })
    dbRepos = currentRepos.map(repo => repo.doc.fullName.split('/')[1])
    accountName = currentRepos[0].doc.fullName.split('/')[0]
  } catch (error) {
    log.error('Could not get repos from database', { error: error.message })
  }

  try {
    gitHubRepos = await githubQueue(installationId).read(github => github.apps.listRepos({
      headers: {
        accept: 'application/vnd.github.machine-man-preview+json'
      },
      org: 'neighbourhoodie',
      per_page: 100
    }))
  } catch (error) {
    log.error('Could not get repos from Github', { error: error.message })
  }

  log.info('There are more active repos on GitHub than in our database.')

  // create missing repositories
  let reposToCreate = []
  gitHubRepos.repositories.map(ghRepo => {
    if (!ghRepo.name.includes(dbRepos)) {
      reposToCreate.push(ghRepo)
    }
  })

  log.info('Starting to create missing repoDocs')
  try {
    const repoDocs = await createDocs({
      reposToCreate,
      accountId: String(accountId)
    })
    await repositories.bulkDocs(repoDocs)
  } catch (error) {
    log.warn('Could not create repository', { error: error.message })
  }

  const client = redis.createClient(process.env.REDIS_URL)
  const del = promisify(client.del)
  await del(`sync_${accountName}`)
}
