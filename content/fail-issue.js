const _ = require('lodash')
const md = require('./template')
const { generateGitHubCompareURL } = require('../utils/utils')

const notDevDependency = ({dependency}) => md`
${dependency} is a direct dependency of this project, and **it is very likely causing it to break**. If other packages depend on yours, this update is probably also breaking those in turn.
`

const devDependency = ({dependency, dependencyType}) => md`
${dependency} is a ${dependencyType.replace(/ies$/, 'y')} of this project. It **might not break your production code or affect downstream projects**, but probably breaks your build or test tools, which may **prevent deploying or publishing**.
`

/*
This formats both statuses and checks:

status key -> check_run key
state -> check_run.conclusion
context -> check_run.name
description -> check_run.output.summary
target_url -> no equivalent, is included in summary

*/
const individualStatusOrCheck = (status) => {
  let output = `- ${status.state === 'success' ? '✅' : '❌'} **${status.context}:** ${status.description} `
  if (status.target_url) {
    output += `([Details](${status.target_url})).`
  }
  return output
}

const ciStatuses = ({statuses}) => md`
<details>
<summary>Status Details</summary>

${statuses.map(status => individualStatusOrCheck(status))}
</details>
`

module.exports = ({version, dependencyLink, owner, repo, base, head, dependency, oldVersionResolved, dependencyType, statuses, release, diffCommits, monorepoGroupName, packageUpdateList}) => {
  const compareURL = generateGitHubCompareURL(`${owner}/${repo}`, base, head)
  return md`
${monorepoGroupName
    ? `## There have been updates to the *${monorepoGroupName}* monorepo${packageUpdateList && ':\n\n' + packageUpdateList}`
    : `## The ${dependencyType.replace('ies', 'y')} [${dependency}](${dependencyLink}) was updated from \`${oldVersionResolved}\` to \`${version}\`.`
}

🚨 [View failing branch](${compareURL}).

This version is **covered** by your **current version range** and after updating it in your project **the build failed**.

${monorepoGroupName && `This monorepo update includes releases of one or more dependencies which all belong to the [${monorepoGroupName} group definition](https://github.com/greenkeeperio/monorepo-definitions).`
}

${
  dependencyType === 'dependencies'
    ? notDevDependency({dependency})
    : devDependency({dependency, dependencyType})
}

${_.get(statuses, 'length') && ciStatuses({statuses})}

---

${_.compact([release, diffCommits])}


<details>
<summary>FAQ and help</summary>

There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>

---


Your [Greenkeeper](https://greenkeeper.io) Bot :palm_tree:
`
}
