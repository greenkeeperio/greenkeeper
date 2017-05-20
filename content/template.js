const {flatten, zip} = require('lodash')

function template (strings, ...keys) {
  keys = keys.map(key => {
    if (Array.isArray(key)) return key.join('\n')
    return key || ''
  })
  return flatten(zip(strings, keys)).join('')
}

template.link = (text, url) => `[${text}](${url})`
template.code = (text) => '`' + text + '`'

module.exports = template
