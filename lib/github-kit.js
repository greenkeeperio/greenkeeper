/*

github-kit

Helper functions to fetch and put data to/from GitHub

*/

const githubQueue = require('./github-queue')
const _ = require('lodash')

const repositories = (installationId, {owner, repoName}) => {
  return {
    getContent: async (path) => {
      try {
        return await githubQueue(installationId).read(github => github.repos.getContent({ path, owner, repo: repoName }))
      } catch (e) {
        return { name: path, path, content: false }
      }
    },
    issues: {
      create: async (title, body, label) => {
        return githubQueue(installationId).write(github => github.issues.create({
          owner,
          repo: repoName,
          title,
          body,
          labels: [label]
        }))
      }
    }
  }
}

const pushes = (installationId, pushEventData) => ({
  fetchChangedPackageFileContents: () => {
    const changedFilePaths = module.exports(installationId).pushes(pushEventData).getChangedPackageFilePaths()
    return changedFilePaths.map((path) => {
      const fullNameParts = pushEventData.repository.full_name.split('/')
      return module.exports(installationId).repositories({
        owner: fullNameParts[0],
        repoName: fullNameParts[1]
      }).getContent(path)
    })
  },
  getChangedPackageFilePaths: () => {
    return _(pushEventData.commits.map((commit) => {
      return ['added', 'removed', 'modified'].map((type) => {
        return commit[type].filter((path) => {
          return /^package\.json|\/package\.json/.test(path)
        })
      })
    })).flattenDeep().uniq().value()
  },
  getCommits: () => pushEventData.commits,
  getPushInfo: () => pushEventData,
  getRepositoryId: () => pushEventData.repository.id,
  hasHeadCommit: () => !!pushEventData.head_commit,
  isFromDefaultBranch: () => {
    const branchRef = `refs/heads/${pushEventData.repository.default_branch}`
    return pushEventData.ref === branchRef
  },
  hasTooManyPackageJSONs: () => {
    // ⚠️ implement check on how many package files are in the pushEventData
    return false
  }
})

module.exports = (installationId) => {
  return {
    repositories: repositories.bind({}, installationId),
    pushes: pushes.bind({}, installationId)
  }
}
