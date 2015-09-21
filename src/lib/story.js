var _ = require('lodash')
var util = require('util')
var emoji = require('node-emoji')

module.exports = {
  usage: function (commands) {
    return '\nWant to talk to a human? Run `greenkeeper support` :)\n\n' +
      'Usage: greenkeeper <command>\n\n' +
      'where <command> is one of:\n' +
      '    ' + commands.join(', ') + '\n' +
      '\n' + emoji.get('palm_tree')
  },

  disable: {
    error_login_first: 'Please login first',
    error_missing_slug: 'missing slug',
    repo_info: function (slug) {
      return util.format('Slug is:', slug)
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return util.format(slug, 'was not disabled before')
    },
    error_disabled: function (slug) {
      return util.format(slug, 'disabled')
    }
  },

  enable: {
    error_login_first: 'Please login first',
    error_missing_slug: 'missing slug',
    repo_info: function (slug) {
      return util.format('Slug is:', slug)
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return util.format(slug, 'was not enabled before')
    },
    error_enabled: function (slug) {
      return util.format(slug, 'enabled')
    }
  },

  info: {
    error_login_first: 'Please login first',
    error_missing_slug: 'missing slug',
    data: function (data) {
      return data
    }
  },

  login: {
    error_already_logged_in: 'Already logged in. Use --force to continue.',
    request_failed: function (err) {
      return util.format('Request failed', err)
    },
    login_failed: function () {
      return util.format('Login failed', res, data)
    }
  },

  logout: {
    error_already_logged_in: 'Already logged in',
    logged_out: 'Logged out'
  },

  sync: {
    error_login_first: 'Please login first',
    repos: function (repos) {
      return repos.forEach(_.ary(console.log, 1))
    }
  },

  whoami: {
    name: function (data) {
      return data.name
    }
  }

}
