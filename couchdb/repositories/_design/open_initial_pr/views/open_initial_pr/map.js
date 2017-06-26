function (doc) {
  if(doc.type === 'pr' && doc.initial && doc.state === 'open' && !doc.staleInitialPRReminder) {
    emit(doc.createdAt);
  }
}
