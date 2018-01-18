// Incomming: dependency change, repositoryDoc

// get the groups and check if dependency is found in those package.jsons
// return if not or if group ignores the dependency

// sort the dependency change per package.json per type
// (prioritize 'dependency', filter out peerDependency.. ect see registry-change job)

// create branch for each group, wait for status, create PR .. ect (see create-version-branch)
// we need different commit messages for each dependency type
