async function getExecTokens ({
  installationId,
  repoDoc
}, log) {
  try {
    const dbs = require('./dbs')
    const { tokens, 'token-audits': tokenAudits } = await dbs() // eslint-disable-line

    /*
    This is the structure of the tokens 'model'
    _id: `${accountId}
    tokens: {
      ${repoId}: {
      npm: ${token},
      github: ${token}
    }
    }
    */
    let execTokens = ''
    let repositoryTokens = ''
    try {
      repositoryTokens = await tokens.get(repoDoc.accountId)
      log.info('repository tokens received')
    } catch (error) {
      if (error.status === 404) {
        log.info(`No repository token set`, { error })
      } else {
        log.error(`Unable to get repository token`, { error })
      }
    }

    if (repositoryTokens && repositoryTokens.tokens[repoDoc._id]) {
      execTokens = JSON.stringify(repositoryTokens.tokens[repoDoc._id])
      const datetime = new Date().toISOString().substr(0, 19).replace(/[^0-9]/g, '')

      // write audit log entry to 'token-audits' db
      // log entry type: 'read'
      try {
        await tokenAudits.put({
          _id: `${installationId}:${repoDoc._id}:${datetime}:read`,
          keys: Object.keys(repositoryTokens.tokens[repoDoc._id])
        })
      } catch (error) {
        log.error(`Unable to store token audit log`, { installationId, repositoryId: repoDoc._id, error })
      }
    }
    return execTokens
  } catch (error) {
    log.error(`Error while fetching repo tokens`, { installationId, repositoryId: repoDoc._id, error })
  }
}

module.exports = {
  getExecTokens
}
