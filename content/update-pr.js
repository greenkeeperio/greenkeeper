const _ = require('lodash')
const md = require('./template')

module.exports = ({version, dependencyLink, dependency, oldVersionResolved, type, release, diffCommits, plan, isPrivate}) => md`
${betaWarning(isPrivate, plan)}
## Version **${version}** of ${dependencyLink} just got published.

<table>
  <tr>
    <th align=left>
      Dependency
    </td>
    <td>
      ${dependency}
    </td>
  </tr>
  <tr>
    <th align=left>
      Current Version
    </td>
    <td>
      ${oldVersionResolved}
    </td>
  </tr>
  <tr>
    <th align=left>
      Type
    </td>
    <td>
      ${type.replace(/ies$/, 'y')}
    </td>
  </tr>
</table>

The version **${version}** is **not covered** by your **current version range**.

Without accepting this pull request your project will work just like it did before. There might be a bunch of new features, fixes and perf improvements that the maintainers worked on for you though.

I recommend you look into these changes and try to get onto the latest version of ${dependency}.
Given that you have a decent test suite, a passing build is a strong indicator that you can take advantage of these changes by merging the proposed change into your project. Otherwise this branch is a great starting point for you to work on the update.


---


${_.compact([release, diffCommits])}

<details>
  <summary>Not sure how things should work exactly?</summary>

  There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html) and of course you may always [ask my humans](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>


---


Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:

`

function betaWarning (isPrivate, plan) {
  if (!isPrivate || plan !== 'beta') return ''

  return md`
|⚠️  Beta is ending on May 31st ⚠️ |
| --- |
|  To continue using *private repositories* with Greenkeeper, you need to [upgrade to a a paid plan](https://account.greenkeeper.io).  |
  `
}
