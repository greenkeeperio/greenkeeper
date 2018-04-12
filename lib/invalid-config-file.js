const updatedAt = require('./updated-at')
const _ = require('lodash')

async function invalidConfigFile ({repoDoc, config, repositories, repository, repositoryId, details, log}) {
  log.warn('validation of greenkeeper.json failed', {error: details, greenkeeperJson: repoDoc.greenkeeper})
  // reset greenkeeper config in repoDoc to the previous working version and start an 'invalid-config-file' job
  _.set(repoDoc, ['greenkeeper'], config)
  await updateDoc(repositories, repository, repoDoc)
  // If the config file is invalid, open an issue with validation errors and don’t do anything else in this file:
  // - no initial branch should be created (?)
  // - no initial subgroup branches should (or can be) be created
  // - no branches need to be deleted (we can’t be sure the changes are valid)

  return {
    data: {
      name: 'invalid-config-file',
      messages: _.map(details, 'formattedMessage'),
      errors: details,
      repositoryId,
      accountId: repoDoc.accountId
    }
  }
}

function updateDoc (repositories, repository, repoDoc) {
  return repositories.put(
    updatedAt(
      Object.assign(repoDoc, {
        private: repository.private,
        fullName: repository.full_name,
        fork: repository.fork,
        hasIssues: repository.has_issues
      })
    )
  )
}

module.exports = {
  invalidConfigFile
}
