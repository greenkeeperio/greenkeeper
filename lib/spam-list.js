const dbs = require('./dbs')

module.exports = async function getSpamList () {
  const { gk } = dbs()
  return gk.get('spam')
  .then(spamDoc => spamDoc.spam)
  .catch(() => {})
}
