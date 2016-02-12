var fs = require('fs')
var join = require('path').join

var _ = require('lodash')
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

  support: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login'
  },

  disable: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
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
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    repo_info: function (slug) {
      return 'The repository slug is: ' + slug
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return slug + ' is already enabled\nIf this repository is inside an organization, somebody other than you may have done this'
    },
    enabled: function (slug) {
      return slug + ' enabled'
    }
  },

  info: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    data: function (data) {
      return data
    }
  },

  login: {
    error_already_logged_in: 'You’re already logged in. Use --force to continue.\nIf you’re using Greenkeeper for private repositories use both --force and --private.',
    request_failed: 'Request failed',
    login_failed: 'Login failed'
  },

  logout: {
    error_already_logged_out: 'You’re already logged out',
    logged_out: 'Logged out' + ourmoji
  },

  'organization-access': [
    'Opening GitHub application settings in browser',
    'Grant or revoke Greenkeeper access to individual organizations there',
    'After granting access for a new organization run $ greenkeeper sync'
  ],

  sync: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    repos: function (repos) {
      return repos.forEach(_.ary(console.log, 1))
    }
  },

  whoami: {
    name: function (data) {
      return 'You’re currently logged in as ' + data.name +
        (data.plan ? ' (' + data.plan + ')' : '') +
        (data.organizations.length
          ? '\nGreenkeeper can access these organizations:\n\n' + data.organizations.map(function (org) {
            return '    ' + org.name + (org.plan ? ' (' + org.plan +
              (org.paying ? ', paid by you' : '') +
            ')' : '')
          }).sort().join('\n')
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
