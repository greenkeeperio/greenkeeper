const dbs = require('../lib/dbs')
const _ = require('lodash')
const env = require('env')

const githubQueue = require('../lib/github-queue')
const paymentActivatedText = require('../content/payment-activated')

module.exports = async function ({ accountId }) {
  if (env.IS_ENTERPRISE) {
    // not sure what called me, but I should not run
    return
  }

  const { installations, repositories, payments } = await dbs()
  const installation = await installations.get(accountId)
  const ghqueue = githubQueue(installation.installation)

  let payment = {}
  try {
    payment = await payments.get(String(accountId))
  } catch (e) {}

  if (payment.stripeSubscriptionId) {
    await paymentAdded({ repositories, accountId, ghqueue })
  } else {
    throw new Error('No payment')
  }
}

async function paymentAdded ({ repositories, accountId, ghqueue }) {
  const dbResult = _.map(
    (await repositories.query('private_by_account', {
      key: accountId,
      include_docs: true
    })).rows,
    'doc'
  )
  const allRepos = _.keyBy(dbResult, '_id')
  const initialPrs = _.get(
    await repositories.query('initial_pr_payment', {
      keys: _.keys(allRepos),
      include_docs: true
    }),
    'rows'
  )

  for (let pr of initialPrs) {
    const { head, number, state } = pr.doc
    if (state !== 'open') continue
    const repoDoc = allRepos[pr.key]
    const accountToken = repoDoc.accountToken
    const [owner, repo] = repoDoc.fullName.split('/')
    const sha = _.get(
      await ghqueue.write(github => github.gitdata.getReference({ owner, repo, ref: `heads/${head}` })),
      'object.sha'
    )

    if (!sha) throw new Error('Missing sha')

    await setSuccessStatus({ ghqueue, owner, repo, sha, accountToken })
    await commentPaymentWarning({ ghqueue, owner, repo, number, accountToken })
  }
}

async function setSuccessStatus ({ ghqueue, owner, repo, sha, accountToken }) {
  await ghqueue.write(github => github.repos.createStatus({
    owner,
    repo,
    sha,
    state: 'success',
    target_url: `https://account.greenkeeper.io?token=${accountToken}`,
    description: 'Payment has been activated',
    context: 'greenkeeper/payment'
  }))
}

async function commentPaymentWarning (
  { ghqueue, owner, repo, number, accountToken }
) {
  await ghqueue.write(github => github.issues.createComment({
    owner,
    repo,
    number,
    body: paymentActivatedText({ accountToken })
  }))
}
