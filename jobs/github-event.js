const { resolve } = require('path')

module.exports = function ({ type, action }) {
  const paths = [__dirname, 'github-event', type]
  if (action) paths.push(action)
  const requirePath = resolve(...paths)
  if (!requirePath.startsWith(__dirname)) {
    throw new Error('do not escape jobs folder')
  }

  try {
    var handler = require(requirePath)
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return

    throw e
  }

  return handler(...arguments)
}
