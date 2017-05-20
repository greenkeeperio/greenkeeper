const { compact } = require('lodash')
const md = require('./template')

module.exports = prBody

const branchFailed = () => md`
<summary>💥 This branch failed. How to proceed</summary>

I suggest you find out what dependency update is causing the problem. Adapt your code so things are working nicely together again. [next-update](https://www.npmjs.com/package/next-update) is a really handy tool to help you with this.

Push the changes to this branch and merge it.
`

const enablePrivatePackage = ({installationId, secret}) => `
<summary>📦 How to enable private scoped packages</summary>

Public scoped packages (\`@scope/name\`) work out of the box, but for private scoped packages there is an additional step required.

\`\`\`bash
# Install npm's wombat CLI to create npm hooks
npm install --global wombat

# Add a single private scoped package
wombat hook add @scope/name https://hooks.greenkeeper.io/npm/${installationId} ${secret}

# Add all packages of a scope
wombat hook add @scope https://hooks.greenkeeper.io/npm/${installationId} ${secret}

# Add all packages by a specific owner
wombat hook add --type owner substack https://hooks.greenkeeper.io/npm/${installationId} ${secret}

\`\`\`
`

const badgeAddedText = ({badgeUrl}) => md`
<summary>🏷 How to check the status of this repository</summary>

There is a badge added to your README, indicating the status of this repository.

This is how your badge looks like :point_right:  ![Greenkeeper badge](${badgeUrl})
`

const travisModifiedText = () => md`
<summary>🏗 How to configure Travis CI</summary>

There is a rule added to your \`.travis.yml\` file as well. It whitelists Greenkeeper branches, which are created when your dependencies are updated. Travis CI will run your tests to see if they still pass.

No additional setup required 😊

`

const updatePullRequestText = ({ newBranch }) => md`
<summary>👩‍💻 How to update this pull request</summary>

\`\`\`bash
  # change into your repository’s directory
  git fetch
  git checkout ${newBranch}
  npm install-test
  # adapt your code, so it’s working again
  git commit -m 'chore: adapt code to updated dependencies'
  git push origin ${newBranch}
\`\`\`
`

const howToIgnoreDependencies = ({ghRepo, newBranch}) => md`
<summary>🙈 How to ignore certain dependencies</summary>

In case you can not, or do not want to update a certain dependency right now, you can of course just [change the \`package.json\` file back to your liking](${ghRepo.html_url}/edit/${newBranch}/package.json).

Add a \`greenkeeper.ignore\` field to your \`package.json\`, containing a list of dependencies you don’t want to update right now.

\`\`\`js
// package.json
{
  …
  "greenkeeper": {
    "ignore": [
      "package-names",
      "you-want-me-to-ignore"
    ]
  }
}
\`\`\`
`

const howTheUpdatesWillLookLike = () => md`
<summary>✨ How the updates will look like</summary>

As soon as you merge this pull request **I’ll create a branch for every dependency update**, with the new version applied. The branch creation should trigger your testing services to check the new version. Using the results of these tests I’ll try to open meaningful and helpful pull requests and issues, so your dependencies remain working and up-to-date.

\`\`\`diff
-  "underscore": "^1.6.0"
+  "underscore": "^1.7.0"
\`\`\`

In the above example you can see an in-range update. \`1.7.0\` is included in the old \`^1.6.0\` range, because of the [caret \`^\` character ](https://docs.npmjs.com/misc/semver#ranges).
When the test services report success I’ll delete the branch again, because no action needs to be taken – everything is fine.
When there is a failure however, I’ll create an issue so you know about the problem immediately.

This way every single version update of your dependencies will either continue to work with your project, or you’ll get to know of potential problems immediately.

\`\`\`diff
-  "lodash": "^3.0.0"
+  "lodash": "^4.0.0"
\`\`\`

In this example the new version \`4.0.0\` is not included in the old \`^3.0.0\` range.
For version updates like these – let’s call them “out of range” updates – you’ll receive a pull request.

Now **you no longer need to check for exciting new versions by hand** – I’ll just let you know automatically.
And the pull request will not only serve as a reminder to update. In case it passes your decent test suite that’s a strong reason to merge right away :shipit:
`

const faqText = () => md`
<summary>💁‍♂️ Not sure how things are going to work exactly?</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html) and of course you may always [ask my humans](https://github.com/greenkeeperio/greenkeeper/issues/new).
`

const mainMessage = ({enabled, depsUpdated}) => {
  if (enabled) return 'All your dependencies are up-to-date right now, so this repository was enabled right away. Good job :thumbsup:'
  if (depsUpdated) return 'This pull request **updates all your dependencies to their latest version**. Having them all up to date really is the best starting point. I will look out for further dependency updates and make sure to handle them in isolation and in real-time, **as soon as you merge this pull request**.'
  return '' // no updates, but private repository
}

function prBody ({ghRepo, success, secret, installationId, newBranch, badgeUrl, travisModified, enabled, depsUpdated, accountTokenUrl}) {
  return md`
Let’s get started with automated dependency management for ${ghRepo.name} :muscle:

${mainMessage({enabled, depsUpdated})}

${!enabled && '**I won’t start sending you further updates, unless you have merged this very pull request**.'}

${secret && accountTokenUrl && `💸  **Warning** 💸 Enabling this might increase your monthly payment 👉 [check your billing status](${accountTokenUrl})`}


---
${
  compact([
    depsUpdated && !success && branchFailed(),
    secret && enablePrivatePackage({secret, installationId}),
    badgeUrl && badgeAddedText({badgeUrl}),
    travisModified && travisModifiedText(),
    howToIgnoreDependencies({ghRepo, newBranch}),
    updatePullRequestText({ghRepo, newBranch}),
    howTheUpdatesWillLookLike(),
    faqText()
  ]).map(text => `<details>${text}</details>`)
}

---


Good luck with your project and see you soon :sparkles:

Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:
  `
}
