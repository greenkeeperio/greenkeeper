function (doc) {
  if (doc.type !== 'pr' || doc.initial || doc.state !== 'open') return
  emit([doc.repositoryId, doc.dependency])
}
