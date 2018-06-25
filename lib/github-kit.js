/*

github-kit

Helper functions to fetch and put data to/from GitHub

*/

const githubQueue = require('./github-queue')

const repositories = (installationId, {owner, repoName}) => {
  return {
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

module.exports = (installationId) => {
  return {
    repositories: repositories.bind({}, installationId)
  }
}
