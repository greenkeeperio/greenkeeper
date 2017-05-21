const dbs = require('../lib/dbs')
const _ = require('lodash')

const Github = require('../lib/github')
const githubQueue = require('../lib/github-write-queue')
const getToken = require('../lib/get-token')
const paymentActivatedText = require('../content/payment-activated')

module.exports = async function ({ accountId }) {
  const { installations, repositories, payments } = await dbs()
  const installation = await installations.get(accountId)
  const { token } = await getToken(installation.installation)
  const github = Github()
  github.authenticate({ type: 'token', token })

  let payment = {}
  try {
    payment = await payments.get(String(accountId))
  } catch (e) {}

  if (payment.stripeSubscriptionId) {
    await paymentAdded({ repositories, accountId, github })
  } else {
    throw new Error('No payment')
  }
}

async function paymentAdded ({ repositories, accountId, github }) {
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
      await github.gitdata.getReference({ owner, repo, ref: `heads/${head}` }),
      'object.sha'
    )

    if (!sha) throw new Error('Missing sha')

    await setSuccessStatus({ github, owner, repo, sha, accountToken })
    await commentPaymentWarning({ github, owner, repo, number, accountToken })
  }
}

async function setSuccessStatus ({ github, owner, repo, sha, accountToken }) {
  await githubQueue(() => github.repos.createStatus({
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
  { github, owner, repo, number, accountToken }
) {
  await githubQueue(() => github.issues.createComment({
    owner,
    repo,
    number,
    body: paymentActivatedText({ accountToken })
  }))
}
