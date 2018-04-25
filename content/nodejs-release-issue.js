const md = require('./template')
const { generateGitHubCompareURL } = require('../utils/utils')

// messages: { tooComplicated: 1, inRange: 1, updated: 1 }
const showEngineTransformMessages = function (messages) {
  if (!messages) return
  let output = ''
  output += messages.updated > 0 ? `- The engines config in ${messages.updated} of your \`package.json\` files was updated to the new Node.js version\n` : ''
  output += messages.inRange > 0 ? `- The new Node.js version is in-range for the engines in ${messages.inRange} of your \`package.json\` files, so that was left alone\n` : ''
  output += messages.tooComplicated > 0 ? `- The engines config in ${messages.tooComplicated} of your \`package.json\` files was too ambiguous to be updated automatically\n` : ''
  if (output === '') return
  return output
}

const showNVMRCMessage = function (nvmrcModified) {
  if (nvmrcModified) return '- Replaced the old Node.js version in your `.nvmrc` with the new one\n'
}

const showTravisMessage = function (travisModified) {
  if (travisModified) return '- Added the new Node.js version to your `.travis.yml`\n'
}

module.exports = ({owner, repo, base, head, nodeVersion, codeName, travisModified, nvmrcModified, engineTransformMessages}) => {
  const compareURL = generateGitHubCompareURL('', `${owner}/${repo}`, base, head)
  return md`
## Version ${nodeVersion} of Node.js (code name ${codeName}) has been released! 🎊

To see what happens to your code in Node.js ${nodeVersion}, Greenkeeper has created a branch with the following changes:
${showTravisMessage(travisModified)}${showNVMRCMessage(nvmrcModified)}${showEngineTransformMessages(engineTransformMessages)}
If you’re interested in upgrading this repo to Node.js ${nodeVersion}, you can <a href="${compareURL}">open a PR with these changes</a>. Please note that this issue is just intended as a friendly reminder and the PR as a possible starting point for getting your code running on Node.js ${nodeVersion}.

<details>
<summary>More information on this issue</summary>

Greenkeeper has checked the \`engines\` key in any \`package.json\` file, the \`.nvmrc\` file, and the \`.travis.yml\` file, if present.
- \`engines\` was only updated if it defined a single version, not a range.
- \`.nvmrc\` was updated to Node.js ${nodeVersion}
- \`.travis.yml\` was only changed if there was a root-level \`node_js\` that didn’t already include Node.js ${nodeVersion}, such as \`node\` or \`lts/*\`. In this case, the new version was appended to the list. We didn’t touch job or matrix configurations because these tend to be quite specific and complex, and it’s difficult to infer what the intentions were.

For many simpler \`.travis.yml\` configurations, this PR should suffice as-is, but depending on what you’re doing it may require additional work or may not be applicable at all. We’re also aware that you may have good reasons to not update to Node.js ${nodeVersion}, which is why this was sent as an issue and not a pull request. Feel free to delete it without comment, I’m a humble robot and won’t feel rejected :robot:

</details>

---

<details>
<summary>FAQ and help</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>

---


Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:
`
}
