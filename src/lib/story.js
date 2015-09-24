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

var ourmoji = (process.platform === 'darwin' ? '\n' + emoji.get('palm_tree') + ' ' : '')

module.exports = {
  logo: logo,

  usage: function (commands) {
    logo()

    return [
      '',
      'Want to talk to a human? Run `greenkeeper support` :)',
      '',
      'Usage: greenkeeper [--slug=user/repo] <command>',
      '',
      'where <command> is one of:',
      '    ' + _.difference(commands, commands.secrets).join(', '),
      '',
      'Detailed command information:',
      '',
      '      start   learn how to get started with Greenkeeper',
      '',
      '      login   log into Greenkeeper, opens GitHub Authentication',
      '     logout   log out of Greenkeeper',
      '',
      '     enable   enable Greenkeeper for a package',
      '    disable   disable Greenkeeper for a package',
      '',
      '     whoami   show who you are logged in as into Greenkeeper',
      '    upgrade   upgrade to a different plan',
      '',
      '       info   show the state of your package on Greenkeeper',
      '    support   talk to a human, opens support in your browser',
      '',
      '       sync   sync all your GitHub repositories to Greenkeeper',
      '',
      '       help   this screen',
      '',
      '  enable, disable and info take an optional parameter --slug=user/repo',
      '  where `user` is the username or organization on GitHub and `repo` is',
      '  the repository name. If you omit the slug, `greenkeeper` will use',
      '  the current directory’s package.json',
      '',
      '  sync happens automatically when you log in, but needs to be re-run,',
      '  when you add repositories on GitHub.',
      '',
      'Getting Started:',
      '',
      '    Type `greenkeeper start` to learn how to get started.',
      '',
      '#protip: you can type `gk` instead of `greenkeeper` in the Terminal.',
      ''
    ].join('\n') + ourmoji
  },

  start: [
    '',
    '  Getting Started with Greenkeeper:',
    '',
    '    You first step after installing greenkeeper is to log in. Type:',
    '',
    '        $ greenkeeper login',
    '',
    '    Your browser will open a new window or tab and redirect you to',
    '    GitHub’s Application Authentication screen. There is a big green ',
    '    button [Authorize application] at the bottom. When you click it,',
    '    Greenkeeper gets the access to GitHub it needs to do its job, but',
    '    no more. When all goes well, your browser will say “Check your ',
    '    Terminal”, and when you switch back here, the login will be done',
    '    and Greenkeeper will have started to sync your GitHub repo',
    '    information.',
    '',
    '    Congratulations, you made it past the most complicated step!',
    '',
    '    Next, you enable a package of yours. To do this, navigate to a',
    '    local copy of your package (e.g. `cd ~/code/mypackage`). Then:',
    '',
    '        $ greenkeeper enable',
    '',
    '    And that’s it already! :)',
    '',
    '    From here on out, Greenkeeper will work its magic. The first thing',
    '    you are going to notice is a Pull Request where we pin all your',
    '    dependencies in your package’s package.json to their respective',
    '    latest versions. Then, whenever one of your dependencies is updated',
    '    on GitHub, you will receive a Pull Request to update your package',
    '    accordingly.',
    '',
    '    If you’d like to talk to a human or want to report an issue, type:',
    '',
    '       $ greenkeeper support',
    ''
  ].join('\n') + ourmoji,

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
      return util.format(slug, 'is already disabled\nIf this repo is inside an organization, somebody other than you may have done this')
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
      return util.format(slug, 'is already enabled\nIf this repo is inside an organization, somebody other than you may have done this')
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
