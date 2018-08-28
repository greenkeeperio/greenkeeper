const statsd = require('./statsd')
const githubQueue = require('./github-queue')

global.Promise = require('bluebird')

module.exports = async (
  {
    installationId,
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
  const ghqueue = githubQueue(installationId)
  let contents = {}

  const commits = (await Promise.mapSeries(transforms, async (
    { path, transform, message, create },
    index
  ) => {
    let blob = {}
    try {
      if (contents[path]) {
        blob.content = contents[path]
      } else {
        if (path === 'README.md') {
          blob = await ghqueue.read(github => github.repos.getReadme({ owner, repo, ref: branch }))
          path = blob.path
        } else {
          blob = await ghqueue.read(github => github.repos.getContent({
            owner,
            repo,
            path,
            ref: branch
          }))
        }
      }
    } catch (e) {
      if (e.code !== 404) throw e
      if (!create) return
    }
    let oldContent
    if (contents[path]) {
      oldContent = contents[path]
    } else {
      oldContent = blob.content ? Buffer.from(blob.content, 'base64').toString() : ''
    }

    contents[path] = await transform(oldContent, path)
    if (!contents[path] || contents[path] === oldContent) return
    return { path, content: contents[path], message, index }
  })).filter(c => c)

  if (commits.length === 0) return

  const head = await ghqueue.read(github => github.gitdata.getReference({
    owner,
    repo,
    ref: `heads/${branch}`
  }))

  const createCommits = async (sha, { path, content, message, index }) => {
    const newTree = await ghqueue.write(github => github.gitdata.createTree({
      owner,
      repo,
      base_tree: sha,
      tree: [{ path, content, mode: '100644', type: 'blob' }]
    }))

    // ⚠️  if createTree returns a sha that already exists, we shouldn’t continue?

    const commit = await ghqueue.write(github => github.gitdata.createCommit({
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
    await ghqueue.write(github => github.gitdata.createReference({
      owner,
      repo,
      sha,
      ref: 'refs/heads/' + newBranch
    }))
  } catch (err) {
    if (!err.message.includes('already exists')) throw err

    const branch = await ghqueue.read(github => github.repos.getBranch({
      owner,
      repo,
      branch: newBranch
    }))

    if (branch.commit.committer.type !== 'Bot') throw err

    return branch.commit.sha
  }

  statsd.increment('branches')

  return sha
}
