const semver = require('semver')

const caret = /^\d+(\.(x|\*)){0,2}$/i
const tilde = /^\d+\.\d+(\.(x|\*))?$/i
const wildcard = /^(x|\*)(\.(x|\*)){0,2}$/i

function extractPrefix (rawVersion) {
  const version = rawVersion.trim()
  if (!version || wildcard.test(version)) return '>='
  if (version === 'latest' || version === 'next') return '^'
  if (semver.valid(version) || !semver.validRange(version)) return ''

  if (version[0] === '>') return '>='
  if (version[0] === '^' || caret.test(version)) return '^'
  if (version[0] === '~' || tilde.test(version)) return '~'

  return ''
}

module.exports = (version, oldVersion) => extractPrefix(oldVersion) + version
module.exports.extractPrefix = extractPrefix
