var _ = require('lodash')
var util = require('util')
var emoji = require('node-emoji')
var ansi = require('ansi')
var cursor = ansi(process.stderr)

function logo () {
  cursor.green()
  console.error(
    '\n                oooo\n' +
    '                `888\n' +
    '     .ooooooooo  888  ooooo\n' +
    '    8888\' \`8888  888 .88P\'\n' +
    '    8888   8888  8888888.       g r e e n k e e p e r . i o\n' +
    '    \`888bod88P\'  888 \`888b.\n' +
    '     \`Yooooooo. o888o o8888o\n' +
    '          \`Y88b\n' +
    '    d88P   d888\n' +
    '    \`Y8888888P\'\n'
  )
  cursor.reset()
}

module.exports = {
  logo: logo,

  usage: function (commands) {
    logo()
    return '\nWant to talk to a human? Run `greenkeeper support` :)\n\n' +
      'Usage: greenkeeper <command>\n\n' +
      'where <command> is one of:\n' +
      '    ' + _.difference(commands, commands.secrets).join(', ') + '\n' +
      '\n' + emoji.get('palm_tree')
  },

  disable: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    error_missing_slug: 'greenkeeper only works with GitHub repos',
    repo_info: function (slug) {
      return util.format('The repo slug is:', slug)
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return util.format(slug, 'is already disabled\nIf this repo is inside an organisation, somebody other than you may have done this')
    },
    error_disabled: function (slug) {
      return util.format(slug, 'disabled')
    }
  },

  enable: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    error_missing_slug: 'Missing slug\nRun this command from inside your repo or use $ greenkeeper enable --slug <user>/<repo>',
    repo_info: function (slug) {
      return util.format('The repo slug is:', slug)
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return util.format(slug, 'is already enabled\nIf this repo is inside an organisation, somebody other than you may have done this')
    },
    error_enabled: function (slug) {
      return util.format(slug, 'enabled')
    }
  },

  info: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    error_missing_slug: 'Missing slug\nRun this command from inside your repo or use $ greenkeeper enable --slug <user>/<repo>',
    data: function (data) {
      return data
    }
  },

  login: {
    error_already_logged_in: 'You’re already logged in. Use --force to continue.',
    request_failed: function (err) {
      return util.format('Request failed', err)
    },
    login_failed: function (res, data) {
      return util.format('Login failed', res, data)
    }
  },

  logout: {
    error_already_logged_in: 'You’re already logged in',
    logged_out: 'Logged out ' + emoji.get('palm_tree')
  },

  sync: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
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
