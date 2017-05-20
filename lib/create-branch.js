const statsd = require('./statsd')
const githubQueue = require('./github-write-queue')

global.Promise = require('bluebird')

module.exports = async (
  {
    github,
    newBranch,
    branch,
    owner,
    repo,
    message,
    transforms,
    path,
    transform
  }
) => {
  if (!transforms) transforms = [{ transform, path, message }]

  const commits = (await Promise.mapSeries(transforms, async (
    { path, transform, message },
    index
  ) => {
    let blob
    try {
      if (path === '[README]') {
        blob = await github.repos.getReadme({ owner, repo, ref: branch })
        path = blob.path
      } else {
        blob = await github.repos.getContent({
          owner,
          repo,
          path,
          ref: branch
        })
      }
    } catch (e) {
      if (e.code !== 404) throw e
      return
    }
    const oldContent = Buffer.from(blob.content, 'base64').toString()
    const content = await transform(oldContent, path)
    if (!content || content === oldContent) return
    return { path, content, message, index }
  })).filter(c => c)

  if (commits.length === 0) return

  const head = await github.gitdata.getReference({
    owner,
    repo,
    ref: `heads/${branch}`
  })

  const createCommits = async (sha, { path, content, message, index }) => {
    const newTree = await githubQueue(() => github.gitdata.createTree({
      owner,
      repo,
      base_tree: sha,
      tree: [{ path, content, mode: '100644', type: 'blob' }]
    }))

    const commit = await githubQueue(() => github.gitdata.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [sha]
    }))

    transforms[index].created = true

    return commit.sha
  }

  const sha = await Promise.reduce(commits, createCommits, head.object.sha)

  try {
    await githubQueue(() => github.gitdata.createReference({
      owner,
      repo,
      sha,
      ref: 'refs/heads/' + newBranch
    }))
  } catch (err) {
    if (!err.message.includes('already exists')) throw err

    const branch = await github.repos.getBranch({
      owner,
      repo,
      branch: newBranch
    })

    if (branch.commit.committer.type !== 'Bot') throw err

    return branch.commit.sha
  }

  statsd.increment('branches')

  return sha
}
