# Contributing to Greenkeeper

## Table of Contents

- [Code of conduct](#code-of-conduct)
- [Development setup](#development-setup)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Commit message guidelines](#commit-message-guidelines)

## Code of conduct

Help us keep **Greenkeeper** open and inclusive. Please read and follow our [Code of conduct](CODE_OF_CONDUCT.md).

## Development setup

[Fork](https://guides.github.com/activities/forking/#fork) the project, [clone](https://guides.github.com/activities/forking/#clone) your fork, configure the remotes and install the dependencies:

```bash
# Clone your fork of the repo into the current directory
$ git clone https://github.com/<YOUR ACCOUNT>/greenkeeper.git
# Navigate to the newly cloned directory
$ cd greenkeeper
# Assign the original repo to a remote called "upstream"
$ git remote add upstream https://github.com/greenkeeperio/greenkeeper
# Install the dependencies
$ npm install
```

### Tests

To run the tests you will need [Docker](https://docs.docker.com/engine/installation)

```bash
# Install CouchDB on Docker
$ docker pull apache/couchdb:2.3.1
```
A fake private key in the .env file is needed generate it like this:
* Linux
```bash
$ (echo -n "PRIVATE_KEY="; openssl genrsa 2>/dev/null | gzip | base64 -w0) >> .env
```
* Mac:
```bash
$ (echo -n "PRIVATE_KEY="; openssl genrsa 2>/dev/null | gzip | base64) >> .env
```

And at last try to run the tests
```bash
$ npm test
```

Read more about our Jest [tests](https://github.com/greenkeeperio/greenkeeper/tree/master/test)

#### Test Troubleshooting

* Tests fail with: **incorrect header check**
  * you need the fake private key in your .env !

## Submitting a Pull Request

Good pull requests whether patches, improvements or new features are a fantastic help. They should remain focused in scope and avoid containing unrelated commits.

**Please ask first** before embarking on any significant pull request (e.g. implementing features, refactoring code), otherwise you risk spending a lot of time working on something that the project's developers might not want to merge into the project.

If you never created a pull request before, welcome 🎉 😄. [Here is a great tutorial](https://opensource.guide/how-to-contribute/#opening-a-pull-request) on how to send one :)

Here is a summary of the steps to follow:

1. [Set up the development enviroment](#development-setup)
2. If you cloned a while ago, get the latest changes from upstream and update dependencies:
```bash
$ git checkout master
$ git pull upstream master
$ rm -rf node_modules
$ npm install
```
3. Create a new topic branch (off the main project development branch) to contain your feature, change, or fix:
```bash
$ git checkout -b <topic-branch-name>
```
4. Make your commits, follow the [Commit message guidelines](#commit-message-guidelines)
5. Push your topic branch up to your fork:
```bash
$ git push origin <topic-branch-name>
```
6. [Open a Pull Request](https://help.github.com/articles/creating-a-pull-request/#creating-the-pull-request) with a clear title and description.

**Tips**:
- For ambitious tasks, open a Pull Request as soon as possible with the `[WIP]` prefix in the title, in order to get feedback and help from the community.
- [Allow Greenkeeper maintainers to make changes to your Pull Request branch](https://help.github.com/articles/allowing-changes-to-a-pull-request-branch-created-from-a-fork) this way we can rebase it and make some minor changes if necessary. All changes we make will be done in new commit and we'll ask for your approval before merging them.

## Commit message guidelines

Greenkeeper uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated version management and package publishing. For that to work, commitmessages need to be in the right format.

### Atomic commits

If possible, make [atomic commits](https://en.wikipedia.org/wiki/Atomic_commit), which means:
- a commit should contain exactly one self-contained functional change
- a functional change should be contained in exactly one commit
- a commit should not create an inconsistent state (such as test errors, linting errors, partial fix, feature with documentation etc...)

A complex feature can be broken down into multiple commits as long as each one keep a consistent state and consist of a self-contained change.

### Commit message format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special format that includes a **type**, a **scope** and a **subject**:

```commit
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

The **footer** can contain a [closing reference to an issue](https://help.github.com/articles/closing-issues-via-commit-messages).

### Revert

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type

The type must be one of the following:

| Type         | Description                                                                                                 |
|--------------|-------------------------------------------------------------------------------------------------------------|
| **build**    | Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)         |
| **ci**       | Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs) |
| **docs**     | Documentation only changes                                                                                  |
| **feat**     | A new feature                                                                                               |
| **fix**      | A bug fix                                                                                                   |
| **perf**     | A code change that improves performance                                                                     |
| **refactor** | A code change that neither fixes a bug nor adds a feature                                                   |
| **style**    | Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)      |
| **test**     | Adding missing tests or correcting existing tests                                                           |

### Subject

The subject contains succinct description of the change:

- use the imperative, present tense: "change" not "changed" nor "changes"
- don't capitalize first letter
- no dot (.) at the end

### Body
Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer
The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

### Examples

```commit
`fix(pencil): stop graphite breaking when too much pressure applied`
```

```commit
`feat(pencil): add 'graphiteWidth' option`

Fix #42
```

```commit
perf(pencil): remove graphiteWidth option`

BREAKING CHANGE: The graphiteWidth option has been removed.

The default graphite width of 10mm is always used for performance reasons.
```
