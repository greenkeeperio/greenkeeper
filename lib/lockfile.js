const request = require('request-promise')

const env = require('./env')
module.exports = {
  getNewLockfile
}

async function getNewLockfile (pkg, packageJson, lock) {
  const type = pkg.files['package-lock.json'] ? 'npm' : 'yarn'

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
    console.log('build lockfile', e)
    throw e
  }
}
