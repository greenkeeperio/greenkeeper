function (doc) {
  if(doc.type === "repository") {
    emit(doc.fullName.split("/")[0]);
  }
}
