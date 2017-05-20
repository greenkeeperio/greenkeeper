function (doc) {
  if (doc.type !== 'repository' || !doc.enabled || !doc.packages) return
  var types = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
  for (var filename in doc.packages) {
    for (var i in types) {
      var type = types[i]
      if (!doc.packages[filename][type]) continue
      for (var dep in doc.packages[filename][type]) {
        emit(dep, {
          fullName: doc.fullName,
          accountId: doc.accountId,
          filename: filename,
          type: type,
          oldVersion: doc.packages[filename][type][dep]
        })
      }
    }
  }
}
