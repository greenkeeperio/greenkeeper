const _ = require('lodash')
const md = require('./template')

const getSha = (commit) => _.take(commit.sha, 7).join('')

const commitListItem = (commit) => md`- ${md.link(md.code(getSha(commit)), commit.html_url)} <code>${commit.commit.message.split('\n')[0]}</code>`

module.exports = (diff) => md`
The new version differs by ${diff.total_commits} commits${diff.behind_by && ` ahead by ${diff.ahead_by}, behind by ${diff.behind_by}`}.

${_.take(diff.commits.reverse(), 15).map(commitListItem)}

${diff.commits.length > 15 && `There are ${diff.commits.length} commits in total.`}

See the [full diff](${diff.html_url})
`
