const dbs = require('../lib/dbs')
const env = require('../lib/env')
const stripe = require('stripe')(env.STRIPE_SECRET_KEY)
const nodemailer = require('nodemailer')
// get the paymentsDoc with the accountId
// if document has a subsciptionId -> exit

module.exports = async function ({ accountId, stripeSubscriptionId }) {
  const { payments } = await dbs()
  try {
    const paymentsDoc = await payments.get(accountId)
    if (paymentsDoc.stripeSubscriptionId) return
  } catch (e) {
    if (e.status === 404) return
    throw e
  }

  // get subscription from stripe
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  if (subscription.canceled_at === null) return
  // with the subscription get the user from stripe
  const customer = await stripe.customers.retrieve(subscription.customer)
  if (!customer.email) return
  // send email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASSWORD
    }
  })

  const message = {
    to: customer.email,
    from: env.EMAIL_USER,
    subject: 'TODO',
    text: 'TODO'
  }

  await new Promise((resolve, reject) => {
    transporter.sendMail(message, (error, info) => {
      if (error) {
        reject(error)
      } else {
        resolve(info)
      }
    })
  })
}
