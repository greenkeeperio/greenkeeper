const md = require('./template')
const { generateGitHubCompareURL } = require('../utils/utils')

module.exports = ({owner, repo, base, head, nodeVersion, codeName, travisModified, nvmrcModified, packageJsonModified}) => {
  const compareURL = generateGitHubCompareURL('', `${owner}/${repo}`, base, head)
  return md`
## Version ${nodeVersion} of node.js (code name ${codeName}) has been released!

Greenkeeper has already created a branch with the following changes:
${travisModified ? '- Added the new version to your `.travis.yml`' : ''}
${nvmrcModified ? '- Replaced the old version in your `.nvmrc` with the new one' : ''}
${packageJsonModified ? '- Added the new version to the `engines` key in your `package.json`' : ''}

If you’re interested in upgrading this repo to node ${nodeVersion}, you can <a href="${compareURL}">open a PR with these changes</a>.

---

<details>
<summary>FAQ and help</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>

---


Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:
`
}
