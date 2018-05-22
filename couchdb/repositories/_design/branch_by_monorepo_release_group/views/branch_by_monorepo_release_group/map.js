function (doc) {
  if (doc.type !== 'branch' || doc.referenceDeleted || !doc.monorepoGroupName) return
  emit([doc.repositoryId, doc.monorepoGroupName])
}
