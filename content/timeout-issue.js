const md = require('./template')
const env = require('../lib/env')

module.exports = ({ fullName }) =>
  md`🚨 You need to enable Continuous Integration on all branches of this repository. 🚨

To enable Greenkeeper, you need to make sure that a [commit status](https://help.github.com/articles/about-statuses/) is reported on all branches. This is required by Greenkeeper because it uses your CI build statuses to figure out when to notify you about breaking changes.

Since we didn’t receive a CI status on the ${branchLink(fullName)} branch, it’s possible that you don’t have CI set up yet. We recommend using [Travis CI](https://travis-ci.org), but Greenkeeper will work with every other CI service as well.

If you _have_ already set up a CI for this repository, you might need to check how it’s configured. Make sure it is set to run on all new branches. If you don’t want it to run on absolutely every branch, you can whitelist branches starting with ${md.code('greenkeeper/')}.

Once you have installed and configured CI on this repository correctly, you’ll need to re-trigger Greenkeeper’s initial pull request. To do this, please delete the \`greenkeeper/initial\` branch in this repository, and then remove and re-add this repository to the Greenkeeper App’s white list on Github. You'll find this list on your repo or organization’s __settings__ page, under __Installed GitHub Apps__.
`
function branchLink (fullName) {
  return md.link(
    md.code('greenkeeper/initial'),
    `${env.GITHUB_URL}/${fullName}/commits/greenkeeper/initial`
  )
}
