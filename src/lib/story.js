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
      '    ' + _.difference(commands, commands.secrets).join(', ') + '\n\n' +
      ' Detailed command information:\n\n' +
      [
        '      login   log into Greenkeeper, opens GitHub Authentication',
        '     logout   log out of Greenkeeper',
        '',
        '    ensable   enable Greenkeeper a package',
        '    disable   disable Greenkeeper for a package',
        '',           
        '     whoami   show who you are logged in as into Greenkeeper',
        '    upgrade   upgrade to a different plan',
        '',           
        '       info   show the state of your package on Greenkeeper',
        '    support   talk to a human, opens support in your browser',
        '',           
        '       sync   sync all repositories you have access to on GitHub to Greenkeeper',
        '',
        '       help   this screen\n\n',
        '   enable, disable and info take an optional parameter --slug=user/repo',
        '   where `user` is the username or organisation on GitHub and `repo` is',
        '   the repository name. If you omit the slug, `greenkeeper` will use',
        '   the current directory’s package.json\n'
        
      ].join('\n') + 
      (process.platform === 'darwin' ? '\n' + emoji.get('palm_tree') + ' ' : '')
  },

  support: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login'
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
    disabled: function (slug) {
      return util.format(slug, 'disabled')
    }
  },

  enable: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    error_missing_slug: 'Missing slug\nRun this command from inside your repo and add a repository field to the package.json\nExplicitly passing the slug works as well $ greenkeeper enable --slug <user>/<repo>',
    repo_info: function (slug) {
      return util.format('The repo slug is:', slug)
    },
    error_no_data: 'API error',
    error_no_change: function (slug) {
      return util.format(slug, 'is already enabled\nIf this repo is inside an organisation, somebody other than you may have done this')
    },
    enabled: function (slug) {
      return util.format(slug, 'enabled')
    }
  },

  info: {
    error_login_first: 'Please log in to greenkeeper first: $ greenkeeper login',
    error_missing_slug: 'Missing slug\nRun this command from inside your repo and add a repository field to the package.json\nExplicitly passing the slug works as well $ greenkeeper enable --slug <user>/<repo>',
    data: function (data) {
      return data
    }
  },

  login: {
    error_already_logged_in: 'You’re already logged in. Use --force to continue.',
    request_failed: 'Request failed',
    login_failed: 'Login failed'
  },

  logout: {
    error_already_logged_in: 'You’re already logged in',
    logged_out: 'Logged out' + process.platform === 'darwin' ? '\n' + emoji.get('palm_tree') : ''
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
