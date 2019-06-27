const _ = require('lodash')
const md = require('./template')

module.exports = ({
  version, dependencyLink, dependency, monorepoGroupName, release, diffCommits, oldVersionResolved, type, packageUpdateList, license, licenseHasChanged, previousLicense, publisher
}) => {
  const hasReleaseInfo = release && diffCommits
  return md`
${monorepoGroupName
    ? `## There have been updates to the *${monorepoGroupName}* monorepo: \n\n${packageUpdateList}`
    : `## The ${type.replace('ies', 'y')} [${dependency}](${dependencyLink}) was updated from \`${oldVersionResolved}\` to \`${version}\`.`
}
${monorepoGroupName ? 'These versions are' : 'This version is'} **not covered** by your **current version range**.

If you don’t accept this pull request, your project will work just like it did before. However, you might be missing out on a bunch of new features, fixes and/or performance improvements from the dependency update.
${monorepoGroupName && `\nThis monorepo update includes releases of one or more dependencies which all belong to the [${monorepoGroupName} group definition](https://github.com/greenkeeperio/monorepo-definitions).\n`
}
---

**Publisher:** ${publisher}
**License:** ${licenseHasChanged ? `This package’s license has changed from **${previousLicense}** to **${license}** in this release` : `${license}`}

${hasReleaseInfo
    ? _.compact([release, diffCommits])
    : `[Find out more about this release](${dependencyLink}).`
}

---

<details>
  <summary>FAQ and help</summary>

  There is a collection of [frequently asked questions](https://greenkeeper.io/faq.html). If those don’t help, you can always [ask the humans behind Greenkeeper](https://github.com/greenkeeperio/greenkeeper/issues/new).
</details>

---


Your [Greenkeeper](https://greenkeeper.io) bot :palm_tree:

`
}
