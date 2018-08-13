const _ = require('lodash')
const jsonInPlace = require('json-in-place')

const dbs = require('./dbs')
const createBranch = require('./create-branch')
const updatedAt = require('./updated-at')
const getConfig = require('./get-config')
const { getMessage } = require('./get-message')
const statsd = require('./statsd')
const githubQueue = require('./github-queue')

const issueContent = require('../content/fail-issue')

module.exports = async function (
  {
    installationId,
    repositoryId,
    accountId,
    owner,
    repo,
    version,
    dependency,
    dependencyType,
    oldVersionResolved,
    base,
    head,
    dependencyLink,
    release,
    diffCommits,
    statuses,
    monorepoGroupName
  }
) {
  const { repositories } = await dbs()
  const repoDoc = await repositories.get(repositoryId)
  const { branchPrefix, label, commitMessages } = getConfig(repoDoc)

  const body = issueContent({
    dependencyLink,
    oldVersionResolved,
    owner,
    repo,
    head,
    base,
    version,
    dependency,
    dependencyType,
    release,
    diffCommits,
    statuses,
    monorepoGroupName
  })
  const { number } = await githubQueue(installationId).write(github => github.issues.create({
    owner,
    repo,
    title: `An in-range update of ${dependency} is breaking the build 🚨`,
    body,
    labels: [label]
  }))

  statsd.increment('update_issues')

  const newBranch = `${branchPrefix}${dependency}-pin-${oldVersionResolved}`

  function transform (content) {
    const parsed = jsonInPlace(content)
    parsed.set([dependencyType, dependency], oldVersionResolved)
    return parsed.toString()
  }

  const messageValues = { dependency, oldVersion: oldVersionResolved }
  const messageKey = dependencyType === 'devDependencies' ? 'dependencyPin' : 'devDependencyPin'

  const sha = await createBranch({
    installationId,
    owner,
    repoName: repo,
    branch: base,
    newBranch,
    path: 'package.json',
    transform,
    message: getMessage(commitMessages, messageKey, messageValues)
  })

  await repositories.bulkDocs(
    [
      {
        _id: `${repositoryId}:branch:${sha}`,
        type: 'branch',
        purpose: 'pin',
        sha,
        base,
        head: newBranch,
        dependency,
        dependencyType,
        version: oldVersionResolved,
        repositoryId,
        accountId
      },
      {
        _id: `${repositoryId}:issue:${number}`,
        type: 'issue',
        repositoryId,
        version,
        number,
        dependency,
        state: 'open'
      }
    ].map(_.ary(updatedAt, 1))
  )
}
