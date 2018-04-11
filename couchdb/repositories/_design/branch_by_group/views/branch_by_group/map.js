function (doc) {
  if (doc.type !== 'branch' || doc.referenceDeleted) return
  if (doc.head && typeof doc.head === 'string') {
    var branchName = doc.head.split('/')
    if (branchName[1]) {
      var initialGroup = branchName[1].split('initial-')
      if (initialGroup[1]) {
        emit([doc.repositoryId, initialGroup[1]])
      } else {
        emit([doc.repositoryId, branchName[1]])
      }
    }
  }
}
