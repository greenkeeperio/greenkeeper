function (doc) {
  if (doc.type !== 'pr') return
  emit([String(doc.repositoryId), doc.head])
}
