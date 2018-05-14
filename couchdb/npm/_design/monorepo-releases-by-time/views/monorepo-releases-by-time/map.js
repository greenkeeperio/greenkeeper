function (doc) {
  if (doc._id.substr(0, 9) !== 'monorepo:') {
    return
  }
  emit(doc.updatedAt)
}
