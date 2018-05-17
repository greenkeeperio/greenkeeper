const md = require('./template')
const env = require('./env')

module.exports = ({accountToken}) => {
  if (env.IS_ENTERPRISE) {
    return ''
  }

  return md`💸 Payment has been activated 💸
Enabling Greenkeeper on this repository by merging this pull request might increase your monthly payment. If you’re unsure, please [check your billing status](https://account.greenkeeper.io/status?token=${accountToken})`
}
