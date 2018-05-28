const _ = require('lodash')
const md = require('./template')

module.exports = ({version, dependencyLink, dependency, monorepoGroupName, release, diffCommits, oldVersionResolved, type}) => md`
${_.isEmpty(monorepoGroupName)
  ? `## Version **${version}** of ${dependencyLink} was just published.`
  : `## Version **${version}** of ${monorepoGroupName} packages were just published.`}

<table>
  <tr>
    <th align=left>
      Dependency
    </th>
    <td>
      <code>${monorepoGroupName || dependency}</code>
    </td>
  </tr>
  ${oldVersionResolved
  ? `<tr>
      <th align=left>
       Current Version
      </th>
      <td>
        ${oldVersionResolved}
      </td>
    </tr>`
  : ''
  }
  <tr>
    <th align=left>
      Type
    </th>
    <td>
      ${type.replace(/ies$/, 'y')}
    </td>
  </tr>
</table>

The version **${version}** is **not covered** by your **current version range**.

If you don’t accept this pull request, your project will work just like it did before. However, you might be missing out on a bunch of new features, fixes and/or performance improvements from the dependency update.

It might be worth looking into these changes and trying to get this project onto the latest version of ${monorepoGroupName || dependency}.

If you have a solid test suite and good coverage, a passing build is a strong indicator that you can take advantage of these changes directly by merging the proposed change into your project. If the build fails or you don’t have such unconditional trust in your tests, this branch is a great starting point for you to work on the update.


---


${_.compact([release, diffCommits])}

<details>
  <summary>FAQ and help</summary>

  There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>

---


Your [Greenkeeper](https://greenkeeper.io) bot :palm_tree:

`
