function (doc) {
  if (doc.type !== 'issue' || doc.state !== 'open') return
  emit([doc.repositoryId, doc.dependency])
}
