/*

gk-kit

helper functions to fetch and put data to/from GitHub and our database

*/

const _ = require('lodash')
const DBs = require('./dbs')
const updatedAt = require('./updated-at')
const getConfig = require('./get-config')
const GitHubKit = require('./github-kit')

const installations = async (accountId) => {
  const dbs = await DBs()
  const db = dbs.installations
  const installation = await db.get(String(accountId))
  Object.assign(this, {
    installations: {
      getId: () => installation.installation
    }
  })
  return this.installations
}

const repositories = async (accountId, repositoryId) => {
  const dbs = await DBs()
  const db = dbs.repositories
  const repoDoc = await db.get(String(repositoryId))
  const { fullName } = repoDoc
  const [owner, repoName] = fullName.split('/')
  Object.assign(this, {
    repositories: {
      issues: {
        getInvalidConfigIssueNumber: async () => {
          return _.get(
            await db.query('open_invalid_config_issue', {
              key: repositoryId,
              include_docs: true
            }),
            'rows[0].doc.number'
          )
        },
        create: async (title, body, issueDoc) => {
          // open issue on GH
          const installationId = await this.installations.getId()
          // get combined config
          const { label } = getConfig(repoDoc)
          const issue = await GitHubKit(installationId).repositories({owner, repoName}).issues.create(title, body, label)
          // save issue to DB
          await db.put(updatedAt(_.defaults(issueDoc, {
            _id: `${repositoryId}:issue:${issue.number}`,
            type: 'issue',
            repositoryId,
            number: issue.number,
            state: 'open'
          })))
        }
      }
    }
  })
  return this.repositories
}

module.exports = (accountId) => {
  const ctx = {}
  return {
    installations: installations.bind(ctx, accountId),
    repositories: repositories.bind(ctx, accountId)
  }
}
