const env = require('../lib/env')
const slackNotify = require('slack-notify')

const notifyAdmin = (message) => {
  // TODO: send email notifications to us/Enterprise admins with env.ADMIN_EMAIL or similar
  const payload = {
    channel: '#gk-dev',
    username: 'Greenkeeper Admin Notification',
    icon_emoji: ':incoming_envelope:',
    attachments: [
      {
        fallback: message,
        color: 'warning',
        title: 'Incomplete monorepo release',
        text: message
      }
    ]
  }
  sendSlackMessage(payload)
}

const sendSlackMessage = (payload) => {
  if (!env.SLACK_HOOK) return
  const slackResponse = slackNotify(env.SLACK_HOOK)
  slackResponse.send(payload)
}

module.exports = {
  notifyAdmin
}
