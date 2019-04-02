const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')

const JSONStream = require('JSONStream')
const fs = require('fs')
const path = require('path')

/*
Rows from branches.json
look like:
{"dupes":
  [
    [
      {
        "id":"100000999:branch:369a677c347c8dfed4cd0b64a3efae7ccd27262c",
        "key":["100000999","enzyme","3.8.0"],
        "value": {
          branchHead: "greenkeeper/monorepo.enzyme-20181210100936"
          accountId: "238642387"
        }
      },{
        "id":"100000999:branch:9f86308f4b6286ed2475b716812f7c101fcd36fe",
        "key":["100000999","enzyme","3.8.0"],
        "value": {
          branchHead: "greenkeeper/monorepo.enzyme-20181210101135"
          accountId: "238642387"
        }
      }
    ]
  }
}
*/

module.exports = async function () {
  const { repositories, installations } = await dbs()

  let success = []
  let failedInGitHub = []
  let failedInDB = []

  async function asyncForEach (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }

  fs.createReadStream(path.resolve('./branches.json'))
    .pipe(JSONStream.parse('dupes.*'))
    .on('data', (branchArray) => {
      asyncForEach(branchArray, async (branch, index) => {
        const repoId = branch.key[0]
        const accountId = branch.accountId
        const repoDoc = await repositories.get(String(repoId))
        const repositoryFullName = repoDoc.fullName.toLowerCase()
        const accountDoc = await installations.get(String(accountId))
        const installationId = accountDoc.installation
        // Skip first branch so we have one correct one left over
        if (index !== 0) {
          const branchName = branch.value
          console.log('\n')
          console.log(`🤖  Preparing deletion - branchId: "${branch.id}",  #${index} for repoId "${repoId}", branchName: "${branchName}"`)
          const branchDeletedFromGitHub = await deleteBranchFromGitHub({
            installationId,
            branchName,
            repositoryFullName
          })
          if (branchDeletedFromGitHub) {
            // Delete branch doc from db, get it first to get latest rev for remove
            const branchDoc = await repositories.get(branch.id)
            const response = await repositories.remove(branchDoc)
            const docDeletedFromDB = !!response.ok
            if (docDeletedFromDB) {
              console.log(`✅  Finished with ${branch.id}, it was deleted successfully in GitHub and our DB.`)
              success.push(branch.id)
            } else {
              console.log(`💥  Finished with ${branch.id}, it was deleted in GitHub but failed in our DB.`)
              failedInDB.push(branch.id)
            }
          } else {
            console.log(`💥  Finished with ${branch.id}, it failed in GitHub.`)
            failedInGitHub.push(branch.id)
          }
        }
      })
    })
    .on('end', () => {
      console.log(`🚀  Deleted all the branches. ${success} successes, ${failedInGitHub} failed in gitHub, ${failedInDB} failed in DB.`)
      const fileContent = {
        success,
        failedInGitHub,
        failedInDB
      }
      fs.writeFile('branch_removal_log.json', JSON.stringify(fileContent), (err) => {
        if (err) {
          return console.log(err)
        }
        console.log('    The log file was saved. Yay.')
      })
    })
}

const deleteBranchFromGitHub = async ({
  installationId,
  branchName,
  repositoryFullName
}) => {
  const ghqueue = githubQueue(installationId)
  const [owner, repo] = repositoryFullName.split('/')
  try {
    await ghqueue.write(github => github.gitdata.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`
    }))
    return true
  } catch (e) {
  // branch was deleted already and since we wanted to delete it anyway, we're cool
  // with this error
    if (e.status === 422) {
      console.log(`😳  ${branchName} was already deleted`)
      return true
    }
    return false
  }
}
