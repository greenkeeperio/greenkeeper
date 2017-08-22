const md = require('./template')

module.exports = ({fullName}) =>
md`🚨 You need to enable Continuous Integration on all branches of this repository. 🚨

To enable Greenkeeper, you need to make sure that a [commit status](https://help.github.com/articles/about-statuses/) is reported on all branches. This is required by Greenkeeper because we are using your CI build statuses to figure out when to notify you about breaking changes.

Since we did not receive a CI status on the ${branchLink(fullName)} branch, we assume that you still need to configure it.

If you have already set up a CI for this repository, you might need to check your configuration. Make sure it will run on all new branches. If you don’t want it to run on every branch, you can whitelist branches starting with ${md.code('greenkeeper/')}.

We recommend using [Travis CI](https://travis-ci.org), but Greenkeeper will work with every other CI service as well.

Once you have installed CI on this repository, you’ll need to re-trigger Greenkeeper’s initial Pull Request. To do this, please delete the \`greenkeeper/initial\` branch in this repository, and then remove and re-add this repository to the Greenkeeper integration’s white list on Github. You'll find this list on your repo or organization’s __settings__ page, under __Installed GitHub Apps__.
`
function branchLink (fullName) {
  return md.link(
    md.code('greenkeeper/initial'),
    `https://github.com/${fullName}/commits/greenkeeper/initial`
  )
}
