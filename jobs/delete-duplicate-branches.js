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

const pad = '                              '

var log = console.log

console.log = function () {
  log.apply(console, [new Date().toJSON()].concat([...arguments]))
}

console.log('  👍  Required')

module.exports = async function (dryRun = true) {
  console.log(`  🚀  Starting delete-duplicate-branches.js with dryRun: ${dryRun}.`)
  const { repositories, installations } = await dbs()

  let success = []
  let failedInGitHub = []
  let failedInDB = []

  const sourceFile = dryRun ? './jobs/branches_dry_run.json' : './jobs/branches.json'
  fs.createReadStream(path.resolve(sourceFile))
    .pipe(JSONStream.parse('dupes.*'))
    .on('error', (error) => {
      console.log('meep meep', error)
    })
    .on('data', async (branchArray) => {
      let index = 0
      for (const branch of branchArray) {
        try {
          const repoId = branch.key[0]
          const accountId = branch.value.accountId
          const repoDoc = await repositories.get(String(repoId))
          const repositoryFullName = repoDoc.fullName.toLowerCase()
          const accountDoc = await installations.get(String(accountId))
          const installationId = accountDoc.installation
          // Skip first branch so we have one correct one left over
          if (index !== 0) {
            const branchName = branch.value.branchHead
            console.log(`  🤖  Preparing deletion - branchId: "${branch.id}"
${pad} #${index} for repoId "${repoId}"
${pad} branchName: "${branchName}"`)
            dryRun && console.log(`  🌳  Dry run deleteBranchFromGitHub
${pad} installationId: ${installationId}
${pad} branchName: ${branchName}
${pad} repositoryFullName: ${repositoryFullName}`)
            const branchDeletedFromGitHub = dryRun ? true : await deleteBranchFromGitHub({
              installationId,
              branchName,
              repositoryFullName
            })
            if (branchDeletedFromGitHub) {
              // Delete branch doc from db, get it first to get latest rev for remove
              const branchDoc = await repositories.get(branch.id)
              dryRun && console.log(`  👢  Dry run remove repo from DB - branch.id: ${branch.id}`)
              const response = dryRun ? { ok: true } : await repositories.remove(branchDoc)
              const docDeletedFromDB = !!response.ok
              if (docDeletedFromDB) {
                console.log(`  ✅  Finished with ${branch.id}, it was deleted successfully in GitHub and our DB.`)
                success.push(branch.id)
              } else {
                console.log(`  💥  Finished with ${branch.id}, it was deleted in GitHub but failed in our DB.`)
                failedInDB.push(branch.id)
              }
            } else {
              console.log(`  💥  Finished with ${branch.id}, it failed in GitHub.`)
              failedInGitHub.push(branch.id)
            }
          }
          index++
        } catch (err) {
          console.log('💥  ', err)
        }
      }
    })
    .on('end', () => {
      dryRun && console.log('  ✅  The dry run for all branches was started')
      /*
      // None of this works because it’s not run at the very end
      console.log(`
  🚀  Deleted all the branches. ${success} successes, ${failedInGitHub} failed in gitHub, ${failedInDB} failed in DB.`)
      const fileContent = {
        success,
        failedInGitHub,
        failedInDB
      }
      const fileName = dryRun ? 'branch_removal_dry_run_log.json' : 'branch_removal_log.json'
      fs.writeFile(fileName, JSON.stringify(fileContent), (err) => {
        if (err) {
          return console.log(err)
        }
        console.log('    The log file was saved. Yay.')
      })
      */
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
      console.log(`  😳  ${branchName} was already deleted`)
      return true
    }
    return false
  }
}
