function (doc) {
  if (doc.type !== 'repository') return

  emit(doc.fullName.toLowerCase())
}
