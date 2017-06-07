const _ = require('lodash')

const getInfos = require('./get-infos')
const openIssue = require('./open-issue')
const statsd = require('./statsd')
const upsert = require('./upsert')
const dbs = require('./dbs')
const githubQueue = require('./github-queue')

module.exports = async function (
  { installationId, accountId, repository, branchDoc, combined }
) {
  const { repositories, npm } = await dbs()
  const [owner, repo] = repository.full_name.split('/')
  const repositoryId = String(repository.id)
  const {
    purpose,
    dependency,
    version,
    oldVersionResolved,
    base,
    head,
    dependencyType
  } = branchDoc
  const ghqueue = githubQueue(installationId)

  const issue = _.get(
    await repositories.query('issue_open_by_dependency', {
      key: [repositoryId, dependency],
      include_docs: true
    }),
    'rows[0].doc'
  )
  const { number } = issue || {}

  const change = {
    statuses: combined.statuses,
    processed: true,
    state: combined.state
  }

  if (!issue && combined.state === 'success') {
    try {
      await ghqueue.write(github => github.gitdata.deleteReference({
        owner,
        repo,
        ref: 'heads/' + head
      }))
    } catch (e) {
      if (e.code !== 422) throw e
    }

    await upsert(
      repositories,
      branchDoc._id,
      Object.assign(
        {
          referenceDeleted: true
        },
        change
      )
    )

    return
  }

  branchDoc = await upsert(repositories, branchDoc._id, change)

  if (purpose === 'pin') {
    if (!issue) throw new Error('Inconsistent state')

    await ghqueue.write(github => github.issues.createComment({
      owner,
      repo,
      number,
      body: combined.state === 'success'
        ? `After pinning to **${version}** your tests are passing again. [Downgrade this dependency 📌](/${owner}/${repo}/compare/${encodeURIComponent(head)}?expand=1).`
        : `After pinning to **${version}** your tests are still failing. The reported issue _might_ not affect your project. These imprecisions are caused by inconsistent test results.`
    }))

    statsd.increment('issue_comments')

    return
  }

  const { versions } = await npm.get(dependency)
  const diffBase = issue
    ? _.get(issue, 'comments.length') ? _.last(issue.comments) : issue.version
    : oldVersionResolved

  const { dependencyLink, release, diffCommits } = await getInfos({
    installationId,
    dependency,
    version,
    diffBase,
    versions
  })

  if (!issue && combined.state === 'failure') {
    await openIssue({
      installationId,
      owner,
      repo,
      repositoryId,
      accountId,
      version,
      dependency,
      dependencyType,
      oldVersionResolved,
      base,
      head,
      dependencyLink,
      release,
      diffCommits,
      statuses: combined.statuses
    })
    return
  }
  const bodyDetails = _.compact(['\n', release, diffCommits]).join('\n')

  if (combined.state === 'failure') {
    await ghqueue.write(github => github.issues.createComment({
      owner,
      repo,
      number,
      body: `## Version **${version}** just got published. \nYour tests are still failing with this version. [Compare the changes 🚨](/${owner}/${repo}/compare/${encodeURIComponent(head)}) ${bodyDetails}`
    }))

    statsd.increment('issue_comments')

    await upsert(repositories, issue._id, {
      comments: [...(issue.comments || []), version]
    })

    return
  }

  await ghqueue.write(github => github.issues.createComment({
    owner,
    repo,
    number,
    body: `## Version **${version}** just got published. \nYour tests are passing again with this version. [Explicitly upgrade to this version 🚀](/${owner}/${repo}/compare/${encodeURIComponent(head)}?expand=1) ${bodyDetails}`
  }))

  statsd.increment('issue_comments')

  // Not closing the issue, so decision whether to explicitly upgrade or just close is with the user
  // await github.issues.edit({owner, repo, number, state: 'closed'})
}
