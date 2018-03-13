const _ = require('lodash')

module.exports = function (oldFile, newFile) {
  const changes = {added: [], removed: [], modified: []}
  if (!newFile || !oldFile) return changes
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
