var fs = require('fs')
var join = require('path').join

var chalk = require('chalk')
var md = require('cli-md')
var emoji = require('node-emoji')

var logo = require('./logo')

var ourmoji = (process.platform === 'darwin' ? '\n' + emoji.get('palm_tree') + ' ' : '')

module.exports = {
  usage: function () {
    return md(getReadme(1) + ourmoji)
  },

  start: function () {
    logo()
    return md(getReadme(0) + ourmoji)
  },

  disable: {
    error_login_first: 'Please log in first: ' + chalk.yellow('greenkeeper login'),
    repo_info: function (slug) {
      return 'The repository slug is: ' + slug
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return slug + ' is already disabled\nIf this repository is inside an organization, somebody other than you may have done this'
    },
    disabled: function (slug) {
      return slug + ' disabled'
    }
  },

  enable: {
    error_login_first: 'Please log in first: ' + chalk.yellow('greenkeeper login'),
    repo_info: function (slug) {
      return 'The repository slug is: ' + slug
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return slug + ' is already enabled\nIf this repository is inside an organization, somebody other than you may have done this'
    },
    enabled: function (slug) {
      return slug + ' enabled'
    },
    fail: function () {
      return md(getReadme(2))
    }
  },

  info: {
    error_login_first: 'Please log in first: ' + chalk.yellow('greenkeeper login'),
    data: function (data) {
      return data
    }
  },

  login: {
    error_already_logged_in: 'You’re already logged in. Use --force to continue.\nIf you’re using private repositories use both --force and --private.',
    request_failed: 'Request failed',
    login_failed: 'Login failed'
  },

  logout: {
    error_already_logged_out: 'You’re already logged out',
    logged_out: 'Logged out' + ourmoji
  },

  'organization-access': [
    'Opening GitHub application settings in browser',
    'Grant or revoke access to individual organizations there',
    'After granting access for a new organization run ' + chalk.yellow('greenkeeper sync')
  ],

  sync: {
    error_login_first: 'Please log in first: ' + chalk.yellow('greenkeeper login')
  },

  whoami: {
    name: function (data) {
      function format (plan) {
        if (plan === 'free') return chalk.dim(plan)

        return chalk.green(plan)
      }

      return 'You’re currently logged in as ' + chalk.bold(data.name) +
        (data.plan ? ' (' + format(data.plan) + ')' : '') + '.' +
        (data.organizations.length
          ? '\nGreenkeeper can access these organizations:\n\n' + data.organizations
          .sort(function (a, b) {
            if (a.paying && !b.paying) return -1
            if (!a.paying && b.paying) return 1
            if (a.paying && b.paying) return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1

            if (a.plan !== 'free' && b.plan === 'free') return -1
            if (a.plan === 'free' && b.plan !== 'free') return 1

            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
          })
          .map(function (org) {
            return '    ' + chalk.bold(org.name) + (org.plan ? ' ' + format(org.plan) +
              (org.paying ? ', ' + chalk.underline('paid by you') : '') : '')
          }).join('\n')
          : ''
        )
    }
  }

}

function getReadme (index) {
  var content = fs.readFileSync(join(__dirname, '../../README.md'), 'utf8')

  if (typeof index !== 'number') return content
  return content.split('<!-- section /-->')[index]
}
