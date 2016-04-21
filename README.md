# Getting Started with Greenkeeper

To **install Greenkeeper**, type:
```
npm install -g greenkeeper
```

Then log in:
```
greenkeeper login
```

Your browser will open a new window or tab and redirect you to GitHub’s
Application Authentication screen. There is a big green button **[Authorize
application]** at the bottom. When you click it, Greenkeeper gets the access to
GitHub it needs to do its job, but no more. When all goes well, your browser
will say “Check your Terminal”, and when you switch back here, the login will
be done and Greenkeeper will have started to sync your GitHub repository
information.

_Congratulations, you made it past the most complicated step!_

Next, you **enable a repository of yours**. To do this, navigate to a local
copy of your repository (e.g. `cd ~/code/myrepo`). Then:

```
greenkeeper enable
```

And **that’s it** already! :)

From here on out, **Greenkeeper will do its job automatically**. If your
dependencies are already outdated the first thing you are going to notice is a
Pull Request where we update all your dependencies in your repository’s
package.json to their respective latest versions. Then, whenever one of your
dependencies is updated on npm, you will receive a Pull Request to update your
repository accordingly.

If you’d like to talk to a human or want to report an issue, type:

```
greenkeeper support
```

<!-- section /-->

# Usage

Have a question? Check the FAQ at https://greenkeeper.io/faq.html, or talk to a human:
Run `greenkeeper support` :)

Usage: `greenkeeper [--slug=user/repository] <command>`

| command     |  |
| ----------: | :--- |
| start       | learn how to get started |
| login       | opens GitHub Authentication |
| logout      | |
| enable      | enable  a repository |
| disable     | disable a repository |
| list        | a list of all enabled repositories |
| upgrade     | upgrade to a different plan |
| whoami      | show who you are logged in as and what organizations you can access |
| info        | show the state of your repository |
| support     | opens support in your browser |
| sync        | sync all your GitHub repositories |
| npm-access  | grant access to your private npm packages |
| npm-verify  | check access to private npm packages |
| postpublish | add the postpublish hook to your scoped module |
| config      | get, set and delete config |
| --help      | this screen |
| --version   | current version of the CLI |

`enable`, `disable` and `info` take an optional parameter --slug=user/repository
where `user` is the username or organization on GitHub and `repository` is the
repository name. If you omit the slug, `greenkeeper` will use the current
directory’s git remote "origin"

sync happens automatically when you log in. Also `enable` performs a sync automatically
in case the repository you try to enable is not found.

Type `greenkeeper start` to learn how to get started.

protip: you can type `gk` instead of `greenkeeper` and abbreviate every
command, as long as it’s unambiguous

<!-- section /-->

# The CLI

[![Build Status](https://travis-ci.org/greenkeeperio/greenkeeper.svg?branch=master)](https://travis-ci.org/greenkeeperio/greenkeeper)
[![Dependency Status](https://david-dm.org/greenkeeperio/greenkeeper/master.svg)](https://david-dm.org/greenkeeperio/greenkeeper/master)
[![devDependency Status](https://david-dm.org/greenkeeperio/greenkeeper/master/dev-status.svg)](https://david-dm.org/greenkeeperio/greenkeeper/master#info=devDependencies)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

[![NPM](https://nodei.co/npm/greenkeeper.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/greenkeeper/)

🌴
