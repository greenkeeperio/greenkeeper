function (doc) {
  if (doc.type !== 'branch' || doc.referenceDeleted) return
  if (doc.head && typeof doc.head === 'string') {
    var branchName = doc.head.split('/')
    if (branchName[1]) {
      emit([doc.repositoryId, branchName[1]])
    }
  }
}
