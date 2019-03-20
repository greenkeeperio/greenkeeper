const redis = require('redis')
const { promisify } = require('util')
const Log = require('gk-log')
const { flatten } = require('lodash')

const dbs = require('../lib/dbs')
const { createDocs } = require('../lib/repository-docs')
const GitHub = require('../lib/github')
const getToken = require('../lib/get-token')

module.exports = async function ({ accountId }) {
  const { installations, repositories } = await dbs()
  const logs = dbs.getLogsDb()
  const log = Log({ logsDb: logs, accountId: accountId, repoSlug: null, context: 'sync-repos' })
  log.info(`started`)

  const installation = await installations.get(String(accountId))
  const installationId = installation.installation

  let dbRepos
  let gitHubRepos
  let accountName
  try {
    const repoDoc = await installations.get(String(accountId))
    accountName = repoDoc.login
    const { rows: currentRepos } = await repositories.query('repo-by-org/repo-by-org', {
      key: accountName,
      reduce: false,
      include_docs: true
    })
    dbRepos = currentRepos.map(repo => repo.doc.fullName.split('/')[1])
  } catch (error) {
    log.error('Could not get repos from database', { error: error.message })
  }

  try {
    const { token } = await getToken(Number(installationId))
    const github = GitHub({ auth: `token ${token}` })
    const options = github.apps.listRepos.endpoint.merge({
      headers: {
        accept: 'application/vnd.github.machine-man-preview+json'
      },
      per_page: 100
    })

    // Paginate does not actually flatten results into a single result array
    // as it should, according to the docs, possibly due to these:
    // https://github.com/octokit/rest.js/issues/1161
    // https://github.com/octokit/routes/issues/329
    const results = await github.paginate(options)
    // So we flatten them ourselves
    gitHubRepos = flatten(results.map((result) => result.repositories))
  } catch (error) {
    log.error('Could not get repos from Github', { error: error.message })
  }
  log.info('There are more active repos on GitHub than in our database.')

  // create missing repositories
  let reposToCreate = []
  gitHubRepos.map(ghRepo => {
    if (!dbRepos.includes(ghRepo.name)) {
      reposToCreate.push(ghRepo)
    }
  })

  log.info('Starting to create missing repoDocs')
  try {
    const repoDocs = await createDocs({
      repositories: reposToCreate,
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
