const dbs = require('../lib/dbs')
const githubQueue = require('../lib/github-queue')
const fs = require('fs')
const _ = require('lodash')

var log = console.log

console.log = function () {
  log.apply(console, [new Date().toJSON()].concat([...arguments]))
}

console.log('  👍  Required')

// Deletes duplicate comments on PRs and issues
module.exports = async function (dryRun = true) {
  console.log(`  🚀  Starting delete-duplicate-comments.js with dryRun: ${dryRun}.`)
  const { repositories, installations } = await dbs()
  console.log(`  ⏲️  Opened the databases.`)

  const sourceFile = dryRun ? './jobs/comments_dry_run.json' : './jobs/comments.json'
  const fileContents = fs.readFileSync(sourceFile, 'utf8')
  let fileData
  try {
    console.log(`  👀  Starting to parse the comments file: ${sourceFile}.`)
    fileData = JSON.parse(fileContents)
  } catch (err) {
    console.error(err)
  }

  // rows contains multiple entries for a PR/Issue, we need to reduce this to only get the PR/Issue id
  // {"id":"100000999:pr:143191418","key":["100000999:pr:143191418","16.4.1"],"value":null}
  const ids = _.uniq(fileData.rows.map((row) => {
    return row.id
  }))

  for (const id of ids) {
    console.log(`  got id ${id}`)
    const repoId = id.split(':')[0]
    let repoDoc
    let prDoc
    try {
      repoDoc = await repositories.get(String(repoId))
      prDoc = await repositories.get(String(id))
      const accountId = repoDoc.accountId
      const installation = await installations.get(accountId)
      const installationId = installation.installation
      const [ owner, repo ] = repoDoc.fullName.toLowerCase().split('/')
      const { number } = prDoc
      console.log(`  ✊  fetching pr #${number} for ${owner}/${repo} at installation ${installationId}.`)
      const ghqueue = githubQueue(installationId)
      // https://octokit.github.io/rest.js/#api-Issues-listComments
      // Also, FUN: the issues endpoint gets comments for PRs, but PR endpoint doesn’t 🙄
      // because `pr/comments` are REVIEW comments, `issues/comments` on a PR are comment comments
      const comments = await ghqueue.read(github => github.issues.listComments({
        owner,
        repo,
        number,
        per_page: 100,
        page: 1
      }))
      // TODO: only continue if it's still open?
      // Get only comments by us
      const relevantComments = _.compact(comments.map((comment) => {
        if (comment.user.login === 'greenkeeper[bot]') {
          return {
            body: comment.body,
            id: comment.id
          }
        }
      }))
      console.log(`  1️⃣  Got ${relevantComments.length} relevant comments…`)
      /*
      ⚠️ duplicate comment bodies will be identical save for the timestamp in the branch name in the compare link:
      ```
      blah blah blah… BrisklyPapers:greenkeeper%2Fmonorepo.react-20190221181432) …blah blah blah',
      blah blah blah… BrisklyPapers:greenkeeper%2Fmonorepo.react-20190221201637) …blah blah blah'
      ```

      This regex will provide capturegroups for everything before and after the timestamp (groups 1 and 3),
      named pre and post:
      /([\w\W]+\/compare\/[\w\W]+)([\d]{14})([\w\W]+)/

      Note that this will only match dupes since we launched monorepo support
      */

      const duplicateCommentIDs = []
      relevantComments.map((currentComment) => {
        if (!duplicateCommentIDs.includes(currentComment.id)) {
          const regex = /([\w\W]+\/compare\/[\w\W]+)([\d]{14})([\w\W]+)/
          const match = currentComment.body.match(regex)
          if (match) {
            const [, pre, , post] = match
            comments.map((comment) => {
              const innerMatch = comment.body.match(regex)
              if (innerMatch) {
                const [, pre2, , post2] = innerMatch
                if (pre === pre2 && post === post2 && currentComment.id !== comment.id) {
                  if (!duplicateCommentIDs.includes(comment.id)) {
                    // console.log(`  👭  Found a dupe…`)
                    duplicateCommentIDs.push(comment.id)
                  }
                }
              }
            })
          }
        }
      })

      console.log(`  ⚙️  Found ${duplicateCommentIDs.length} comments to delete from ${owner}/${repo} #${number}.`)
      for (const duplicateID of duplicateCommentIDs) {
        console.log(`  👢  Deleting comment ${duplicateID} from ${owner}/${repo} #${number}.`)
        // https://octokit.github.io/rest.js/#api-Issues-deleteComment
        if (!dryRun) {
          try {
            await ghqueue.read(github => github.issues.deleteComment({
              owner,
              repo,
              comment_id: duplicateID
            }))
          } catch (err) {
            console.log(`  💥  Error deleting comment ${duplicateID} from ${owner}/${repo} #${number}.`, err)
          }
        }
      }
    } catch (err) {
      console.log('  💥  problem getting pr or repo doc, or reading from GH', err)
    }
  }
  console.log(`  ✅ Done.`)
  process.exit()
}
