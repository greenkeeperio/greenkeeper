function (doc) {
  if(doc.type === 'issue' && doc.invalidConfig && doc.state === 'open') {
    emit(doc.repositoryId);
  }
}
