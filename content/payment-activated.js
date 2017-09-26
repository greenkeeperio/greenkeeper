const md = require('./template')

module.exports = ({accountToken}) => md`💸 Payment has been activated 💸
Enabling Greenkeeper on this repository by merging this pull request might increase your monthly payment. If you’re unsure, please [check your billing status](https://account.greenkeeper.io/status?token=${accountToken})
`
