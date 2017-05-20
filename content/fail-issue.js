const _ = require('lodash')
const md = require('./template')

const notDevDependency = ({dependency}) => md`
${dependency} is a direct dependency of this project **this is very likely breaking your project right now**. If other packages depend on you it’s very likely also breaking them.
I recommend you give this issue a very high priority. I’m sure you can resolve this :muscle:
`

const devDependency = ({dependency, dependencyType}) => md`
As ${dependency} is “only” a ${dependencyType.replace(/ies$/, 'y')} of this project it **might not break production or downstream projects**, but “only” your build or test tools – **preventing new deploys or publishes**.

I recommend you give this issue a high priority. I’m sure you can resolve this :muscle:
`

const ciStatuses = ({statuses}) => md`
<details>
<summary>Status Details</summary>

${statuses.map(status => `- ${status.state === 'success' ? '✅' : '❌'} **${status.context}** ${status.description} [Details](${status.target_url})`)}
</details>
`

module.exports = ({version, dependencyLink, owner, repo, head, dependency, oldVersionResolved, dependencyType, statuses, release, diffCommits}) => md`
## Version **${version}** of ${dependencyLink} just got published.

<table>
  <tr>
    <th align=left>
      Branch
    </th>
    <td>
      <a href="/${owner}/${repo}/compare/${encodeURIComponent(head)}">Build failing 🚨</a>
    </td>
  </tr>
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
      ${dependencyType.replace(/ies$/, 'y')}
    </td>
  </tr>
</table>

This version is **covered** by your **current version range** and after updating it in your project **the build failed**.

${
  dependencyType === 'dependencies'
  ? notDevDependency({dependency})
  : devDependency({dependency, dependencyType})
}

${_.get(statuses, 'length') && ciStatuses({statuses})}

---

${_.compact([release, diffCommits])}


<details>
<summary>Not sure how things should work exactly?</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html) and of course you may always [ask my humans](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>


---


Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:
`
