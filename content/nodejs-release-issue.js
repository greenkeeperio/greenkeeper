const md = require('./template')
const { generateGitHubCompareURL } = require('../utils/utils')

// messages: { tooComplicated: 1, inRange: 1, updated: 1 }
const showEngineTransformMessages = function (messages) {
  if (!messages) return
  let output = ''
  output += messages.updated > 0 ? `- The engines config in ${messages.updated} of your \`package.json\` files was updated to the new node version\n` : ''
  output += messages.inRange > 0 ? `- The new node version is in-range for the engines in ${messages.inRange} of your \`package.json\` files, so that was left alone\n` : ''
  output += messages.tooComplicated > 0 ? `- The engines config in ${messages.tooComplicated} of your \`package.json\` files was too ambiguous to be updated automatically\n` : ''
  if (output === '') return
  return output
}

const showNVMRCMessage = function (nvmrcModified) {
  if (nvmrcModified) return '- Replaced the old version in your `.nvmrc` with the new one\n'
}

const showTravisMessage = function (travisModified) {
  if (travisModified) return '- Added the new version to your `.travis.yml`\n'
}

module.exports = ({owner, repo, base, head, nodeVersion, codeName, travisModified, nvmrcModified, engineTransformMessages}) => {
  const compareURL = generateGitHubCompareURL('', `${owner}/${repo}`, base, head)
  return md`
## Version ${nodeVersion} of node.js (code name ${codeName}) has been released! 🎊

Greenkeeper has already created a branch with the following changes:
${showTravisMessage(travisModified)}${showNVMRCMessage(nvmrcModified)}${showEngineTransformMessages(engineTransformMessages)}
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
