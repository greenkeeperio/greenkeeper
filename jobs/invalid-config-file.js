const _ = require('lodash')

const dbs = require('../lib/dbs')
const statsd = require('../lib/statsd')
const githubQueue = require('../lib/github-queue')
const updatedAt = require('../lib/updated-at')
const invalidConfigBody = require('../content/invalid-config-issue')
const getConfig = require('../lib/get-config')

module.exports = async function ({ repositoryId, accountId, message }) {
  const { installations, repositories } = await dbs()
  const installation = await installations.get(String(accountId))
  const installationId = installation.installation

  const openIssues = _.get(
    await repositories.query('open_invalid_config_issue', {
      key: repositoryId,
      include_docs: true
    }),
    'rows'
  )
  // don't send too many issues!
  if (openIssues && openIssues.length) return

  // TODO: bring errors messages in a format that can be used in the issue body
  // error example:
  // { message: '"#invalid#groupname#" is not allowed',
  //     path: [ 'groups', '#invalid#groupname#' ],
  //     type: 'object.allowUnknown',
  //     context:
  //      { child: '#invalid#groupname#',
  //        key: '#invalid#groupname#',
  //        label: '#invalid#groupname#' } }

  const repoDoc = await repositories.get(String(repositoryId))
  const { fullName } = repoDoc
  const [owner, repo] = fullName.split('/')
  const { label } = getConfig(repoDoc)

  const { number } = await githubQueue(installationId).write(github => github.issues.create({
    owner,
    repo,
    title: `Invalid Greenkeeper Configuration file`,
    body: invalidConfigBody({ message }),
    labels: [label]
  }))

  statsd.increment('invalid_config_issues')

  await repositories.put(
    updatedAt({
      _id: `${repositoryId}:issue:${number}`,
      type: 'issue',
      initial: false,
      invalidConfig: true,
      repositoryId,
      number,
      state: 'open'
    })
  )
}
