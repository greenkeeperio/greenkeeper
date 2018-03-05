const _ = require('lodash')

const types = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]

module.exports = function (a, b, groupName) {
  const changes = {}
  types.forEach(type => {
    _.keys(_.get(a, type)).forEach(dep => {
      const before = _.get(a, [type, dep])
      const after = _.get(b, [type, dep])
      if (_.get(a, [type, dep]) === _.get(b, [type, dep])) return
      let change = 'modified'
      if (after === undefined) change = 'removed'
      _.set(changes, [type, dep], {
        change,
        before,
        after,
        groupName
      })
    })
    _.keys(_.get(b, type)).forEach(dep => {
      if (_.has(changes, [type, dep])) return
      if (_.get(b, [type, dep]) === _.get(a, [type, dep])) return
      _.set(changes, [type, dep], {
        change: 'added',
        before: _.get(a, [type, dep]),
        after: _.get(b, [type, dep])
      })
    })
  })
  return changes
}
