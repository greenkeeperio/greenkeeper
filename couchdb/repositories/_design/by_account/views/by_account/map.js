function (doc) {
  if (doc.accountId) {
    emit(doc.accountId)
  }
}
