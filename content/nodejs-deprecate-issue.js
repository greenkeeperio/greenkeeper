const md = require('./template')
const { generateGitHubCompareURL } = require('../utils/utils')

// messages: { tooComplicated: 1, inRange: 1, updated: 1 }
const showEngineTransformMessages = function (messages) {
  if (!messages) return
  let output = ''
  output += messages.updated > 0 ? `- The engines config in ${messages.updated} of your \`package.json\` files was updated to the new lowest actively supported Node.js version\n` : ''
  if (output === '') return
  return output
}

const showNVMRCMessage = function (nvmrcModified) {
  if (nvmrcModified) return '- Replaced the deprecated Node.js version in your `.nvmrc` with the new lowest actively supported one\n'
}

const showTravisMessage = function (travisModified) {
  if (travisModified) return '- Upgraded away from the deprecated version in your `.travis.yml`\n'
}

const showBlogpost = function (announcementURL) {
  if (announcementURL) return `\nYou can find out more about the deprecation and possible update strategies [in this Node.js foundation announcement](${announcementURL}).`
}

module.exports = ({ owner, repo, base, head, nodeVersion, codeName, newLowestVersion, newLowestCodeName, travisModified, nvmrcModified, engineTransformMessages, announcementURL }) => {
  const compareURL = generateGitHubCompareURL(`${owner}/${repo}`, base, head)
  return md`
## Version ${nodeVersion} of Node.js (code name ${codeName}) has been deprecated! 🚑

This means that it is no longer maintained and will not receive any more security updates. Version ${newLowestVersion} (${newLowestCodeName}) is now the lowest actively maintained Node.js version.
To see what effect this update from ${nodeVersion} to ${newLowestVersion} would have on your code, Greenkeeper has already created a branch with the following changes:
${showTravisMessage(travisModified)}${showNVMRCMessage(nvmrcModified)}${showEngineTransformMessages(engineTransformMessages)}
If you’re interested in removing support for Node.js ${nodeVersion} from this repo, you can <a href="${compareURL}">open a PR with these changes</a>.
${showBlogpost(announcementURL)}

<details>
<summary>More information on this issue</summary>

Greenkeeper has checked the \`engines\` key in any \`package.json\` file, the \`.nvmrc\` file, and the \`.travis.yml\` file, if present.
- In \`engines\`, any occurance of ${nodeVersion} was replaced with ${newLowestVersion}
- \`.nvmrc\` was updated to Node.js ${nodeVersion}
- \`.travis.yml\` was only changed if there was a root-level \`node_js\` key that specified Node.js ${nodeVersion}. In this case, ${nodeVersion} was replaced with ${newLowestVersion}. We didn’t touch job or matrix configurations because these tend to be quite specific and complex, and it’s difficult to infer what the intentions were.

For many simpler \`.travis.yml\` configurations, these changes should already suffice, but depending on what you’re doing it may require additional work or may not be applicable at all. We’re also aware that you may have good reasons to continue supporting Node.js ${nodeVersion}, which is why this was sent as an issue and not a pull request. Feel free to delete it without comment, I’m a humble robot and won’t feel rejected 🤖

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
