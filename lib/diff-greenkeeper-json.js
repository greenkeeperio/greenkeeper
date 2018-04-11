const _ = require('lodash')

module.exports = function (oldFile, newFile) {
  const changes = {added: [], removed: [], modified: []}
  if (newFile.__gk_error) return changes
  if (!newFile || !oldFile) return changes
  // greenkeeper.json was deleted
  if (_.isEmpty(newFile) && oldFile.groups) {
    return _.set(changes, 'removed', Object.keys(oldFile.groups))
  }
  // new groups added
  _.set(changes, 'added', _.difference(_.keys(newFile.groups), _.keys(oldFile.groups)))
  // groups removed
  _.set(changes, 'removed', _.difference(_.keys(oldFile.groups), _.keys(newFile.groups)))
  // groups modified
  _.set(changes, 'modified', _.compact(_.map(oldFile.groups, (group, key) => {
    if (newFile.groups[key] && !_.isEqual(group.packages, newFile.groups[key].packages)) return key
  })))

  return changes
}
