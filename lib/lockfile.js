const request = require('request-promise')

const env = require('./env')
module.exports = {
  getNewLockfile
}

async function getNewLockfile (packageJson, lock, isNpm) {
  const type = isNpm ? 'npm' : 'yarn'

  try {
    return request({
      uri: `${env.EXEC_SERVER_URL}`,
      method: 'POST',
      json: true,
      body: {
        type,
        packageJson,
        lock
      }
    })
  } catch (e) {
    console.log('could not build lockfile', e)
    throw e
  }
}
