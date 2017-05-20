function (doc) {
  if (doc.private && doc.enabled) {
    emit(doc.accountId)
  }
}
