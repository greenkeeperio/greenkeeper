const request = require('request-promise')

const env = require('./env')
module.exports = {
  getNewLockfile
}

async function getNewLockfile (pkg) {
  const type = pkg.packages['package-lock.json'] ? 'npm' : 'yarn'
  const packageJson = JSON.stringify(pkg)
  const lock = JSON.stringify(type === 'npm' ? pkg.packages['package-lock.json'] : pkg.packages['yarn.lock'])

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
