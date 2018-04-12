const md = require('./template')

module.exports = (messages, isBlockingInitialPR) => {
  let messageList = messages.map((message, index) => {
    return `${index + 1}. ${message}`
  }).join('\n')

  return md`We have detected a problem with your Greenkeeper config file ${isBlockingInitialPR ? 'which is preventing Greenkeeper from opening its initial pull request' : ''} 🚨

Greenkeeper currently can’t work with your \`greenkeeper.json\` config file because it is invalid. We found the following issue${messages.length === 1 ? '' : 's'}:

${messageList}

Please correct ${messages.length === 1 ? 'this' : 'these'} and commit the fix to your default branch (usually master)${isBlockingInitialPR ? ' so Greenkeeper can run on this repository' : ''}. Greenkeeper will pick up your changes and try again. If in doubt, please consult the [config documentation](https://greenkeeper.io/docs.html#config).

Here’s an example of a valid \`greenkeeper.json\`:

\`\`\`javascript
{
  groups: {
    frontend: {
      packages: [
        'webapp/package.json',
        'cms/package.json',
        'analytics/package.json'
      ]
    },
    build: {
      packages: [
        'package.json'
      ]
    }
  },
  ignore: [
    'standard',
    'eslint'
  ]
}
\`\`\`

This files tells Greenkeeper to handle all dependency updates in two groups. All files in the \`frontend\` group will receive updates together, in one issue or PR, and the root-level \`package.json\` in the \`build\` group will be treated separately. In addition, Greenkeeper will never send updates for the \`standard\` and \`eslint\` packages.

🤖 🌴

  `
}
