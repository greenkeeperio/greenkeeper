function (doc) {
  if (doc.type !== 'branch' || doc.referenceDeleted) return
  emit([doc.repositoryId, doc.dependency, doc.dependencyType])
}
