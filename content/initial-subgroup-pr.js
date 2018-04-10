const _ = require('lodash')
const md = require('./template')
const env = require('../lib/env')

module.exports = prBody

const branchFailed = () => md`
<summary>💥 Tests on this branch are failing. Here’s how to proceed.</summary>

To solve the issue, first find out which of the dependency’s updates is causing the problem. Then fix your code to accomodate the changes in the updated dependency. [next-update](https://www.npmjs.com/package/next-update) is a really handy tool to help you with this.

Then push your changes to this branch and merge it.
`

const enablePrivatePackage = ({installationId, secret}) => `
<summary>📦 How to enable private scoped packages</summary>

Public scoped packages (\`@scope/name\`) work out of the box, but private scoped packages require an additional setup step:

\`\`\`bash
# Install npm's wombat CLI to create npm hooks
npm install --global wombat

# Adding a single private scoped package
wombat hook add @scope/name https://${env.HOOKS_HOST}/npm/${installationId} ${secret}

# Adding all packages of a scope
wombat hook add @scope https://${env.HOOKS_HOST}/npm/${installationId} ${secret}

# Adding all packages by a specific owner
wombat hook add --type owner substack https://${env.HOOKS_HOST}/npm/${installationId} ${secret}

\`\`\`
`

const updatePullRequestText = ({ newBranch }) => md`
<summary>👩‍💻 How to update this pull request</summary>

\`\`\`bash
  # Change into your repository’s directory
  git fetch
  git checkout ${newBranch}
  npm install-test
  # Adapt your code until everything works again
  git commit -m 'chore: adapt code to updated dependencies'
  git push origin ${newBranch}
\`\`\`
`

const howToIgnoreDependencies = ({ghRepo, newBranch}) => md`
<summary>🙈 How to ignore certain dependencies for this group</summary>

You may have good reasons for not wanting to update to a certain dependency right now. In this case, you can [change the dependency’s version string in the \`package.json\` file back to whatever you prefer](${ghRepo.html_url}/edit/${newBranch}/package.json).

To make sure Greenkeeper doesn’t nag you again on the next update of this group, you can add the dependency to this group’s \`ignore\` field in the \`greenkeeper.json\`, for example:
\`\`\`js
// greenkeeper.json
{
  "groups": {
    "frontend": {
      "packages": [
        "frontend/package.json",
        "admin-dashboard/package.json"
      ],
      "ignore": [
        "eslint",
        "standard"
      ]
    }
  }
}
\`\`\`
`

const whatTheUpdatesWillLookLike = () => md`
<summary>✨ How do dependency updates work with Greenkeeper?</summary>

After you merge this pull request, **Greenkeeper will create a new branch whenever a dependency in this group is updated**, with the new version applied to all relevant \`package.json\` files in the group. The branch creation should trigger your testing services and check whether your code still works with the new version of the dependency. Depending on the the results of these tests Greenkeeper will try to open meaningful and helpful pull requests and issues, so your dependencies remain working and up-to-date.

\`\`\`diff
-  "underscore": "^1.6.0"
+  "underscore": "^1.7.0"
\`\`\`

The above example shows an in-range update. \`1.7.0\` is included in the old \`^1.6.0\` range, because of the [caret \`^\` character ](https://docs.npmjs.com/misc/semver#ranges).
When the test services report success, Greenkeeper will silently delete the branch again, because no action needs to be taken: everything is fine.

However, should the tests fail, Greenkeeper will create an issue to inform you about the problem immediately.

This way, you’ll never be surprised by a dependency breaking your code. As long as everything still works, Greenkeeper will stay out of your way, and as soon as something goes wrong, you’ll be the first to know.

\`\`\`diff
-  "lodash": "^3.0.0"
+  "lodash": "^4.0.0"
\`\`\`

In this example, the new version \`4.0.0\` is _not_ included in the old \`^3.0.0\` range. For version updates like these – let’s call them “out of range” updates – you’ll receive a pull request.

This means that **you no longer need to check for new versions manually** – Greenkeeper will keep you up to date automatically.

These pull requests not only serve as reminders to update: If you have solid tests and good coverage, and the pull requests passes those tests, you can very likely just merge it and release a new version of your software straight away :shipit:

To get a better idea of which ranges apply to which releases, check out the extremely useful [semver calculator](https://semver.npmjs.com/) provided by npm.
`

const faqText = () => md`
<summary>FAQ and help</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
`

const mainMessage = ({enabled, depsUpdated, groupName}) => {
  if (depsUpdated) {
    return md`
      This pull request **updates all your dependencies in the group \`${groupName}\` to their latest version**. Having them all up to date really is the best starting point for keeping up with new releases. As long as you have the group defined in your \`greenkeeper.json\`, Greenkeeper will look out for further dependency updates relevant to this group and make sure to always handle them together and in real-time.`
  }
  return '' // no updates, but private repository
}

function prBody ({ghRepo, success, secret, installationId, newBranch, badgeUrl, travisModified, enabled, depsUpdated, accountTokenUrl, files, groupName}) {
  return md`
Greenkeeper has detected a new group called \`${groupName}\` in \`${ghRepo.name}\`. Merge this PR if you’d like Greenkeeper to manage the dependencies in this group. If you don’t want this, remove the group from your \`greenkeeper.json\` in your default branch.

${mainMessage({enabled, depsUpdated, groupName})}

---
${
  _.compact([
    depsUpdated && !success && branchFailed(),
    secret && enablePrivatePackage({secret, installationId}),
    howToIgnoreDependencies({ghRepo, newBranch}),
    updatePullRequestText({ghRepo, newBranch}),
    whatTheUpdatesWillLookLike(),
    faqText()
  ]).map(text => `<details>${text}</details>`)
}

---

Good luck with your project and see you soon :sparkles:

Your [Greenkeeper](https://greenkeeper.io) bot :palm_tree:
`
}
