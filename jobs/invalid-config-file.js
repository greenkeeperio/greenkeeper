/*

# Invalid Config File Issue

Generates an issue if the greenkeeper.json config file in the
repo is invalid, and also saves this issue in our DB.

## Arguments:

repositoryId        :Number
  > eg. 7914533, the GitHub repo ID. Might be a string.

accountId           :Number
  > eg. 391124, the GitHub account ID. Might be a string.

messages            :Array of strings
  > The validation error messages to be displayed in the issue.

isBlockingInitialPR :Boolean
  > Adds extra info to the issue text to make clear that Greenkeeper can’t work until the problem is fixed.

## Outputs/Effects:

Unless we already have an issue of this type on the repo, opens an issue and adds it to our DB as well.

*/
const assert = require('assert')

const statsd = require('../lib/statsd')
const GKKit = require('../lib/gk-kit')
const invalidConfigBody = require('../content/invalid-config-issue')

module.exports = async function ({ repositoryId, accountId, messages, isBlockingInitialPR }) {
  const repo = await GKKit(accountId).repositories(repositoryId)
  const openConfigIssues = await repo.issues.getInvalidConfigIssues()

  assert(!openConfigIssues || !openConfigIssues.length, 'Repo already has an open issue')

  const title = `Invalid Greenkeeper configuration file`
  const body = invalidConfigBody(messages, isBlockingInitialPR)
  await repo.issues.create(
    title,
    body,
    {
      initial: false,
      invalidConfig: true
    }
  )

  statsd.increment('invalid_config_issues')
}
