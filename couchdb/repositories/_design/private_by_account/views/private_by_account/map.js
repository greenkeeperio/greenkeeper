function (doc) {
  if (doc.type === 'repository' && doc.private) {
    emit(doc.accountId)
  }
}
