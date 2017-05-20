function (doc) {
  if (doc.type === 'pr' && doc.initial && doc.state === 'open') {
    emit(doc._id.split(':')[0])
  }
}
