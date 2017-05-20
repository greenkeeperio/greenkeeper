const md = require('./template')

module.exports = ({accountToken}) => md`💸 Payment has been activated 💸
Merging this pull request might increase your monthly payment 👉 [Check your billing status here](https://account.greenkeeper.io/status?token=${accountToken})
`
