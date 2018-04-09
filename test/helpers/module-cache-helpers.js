function cleanCache (module) {
  delete require.cache[require.resolve(module)]
}

function requireFresh (module) {
  cleanCache(module)
  return require(module)
}

module.exports = {
  cleanCache,
  requireFresh
}
