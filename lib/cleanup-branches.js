const _ = require('lodash')

function cleanUpBranches (changes) {
  let branches = []

  _.each(changes, (type, dependencyType) => {
    _.each(type, (dep, dependency) => {
      console.log('dep', dep)
      console.log('dep.change === added', dep.change === 'added')
      if (dep.change === 'added') return
      branches.push(
        Object.assign(
          {
            dependency,
            dependencyType
          },
          dep
        )
      )
    })
  })

  return branches
}

module.exports = {
  cleanUpBranches
}
