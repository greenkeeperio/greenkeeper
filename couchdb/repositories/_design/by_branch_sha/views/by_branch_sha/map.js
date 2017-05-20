function (doc) {
  if (doc.type !== 'branch') return
  emit(doc.sha)
}
