describe('Fails issue content', async () => {
  test('Displays statuses and checks correctly', async () => {
    const content = require('../../content/fail-issue')

    const issueContent = content({
      version: '14.2.0',
      dependencyLink: 'http://lol.cat',
      owner: 'gilliam',
      repo: 'brazil',
      base: 'master',
      head: 'feat/wings',
      dependency: 'tuttle',
      oldVersionResolved: '14.0.0',
      dependencyType: 'dependencies',
      statuses: [
        {
          state: 'success',
          context: 'continuous-integration/travis-ci/push',
          description: 'The Travis CI build passed',
          target_url: 'http://lol.cat'
        }, {
          state: 'failure',
          context: 'continuous-integration/travis-ci/pr',
          description: 'The Travis CI build failed',
          target_url: 'http://lol.cat'
        }, {
          state: 'success',
          context: 'continuous-integration/travis-ci/pr',
          description: '<a href="https://travis-ci.com/club/mate/builds/77480025"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**.'
        }
      ],
      release: '14.2.0',
      diffCommits: `<details>
      <summary>Commits</summary>
      A list of commits
    </details>`,
      monorepoGroupName: ''
    })
    expect(issueContent).toBeTruthy()
    expect(issueContent).toMatch('- ✅ **continuous-integration/travis-ci/push:** The Travis CI build passed ([Details](http://lol.cat)).')
    expect(issueContent).toMatch('- ❌ **continuous-integration/travis-ci/pr:** The Travis CI build failed ([Details](http://lol.cat)).')
    expect(issueContent).toMatch('- ✅ **continuous-integration/travis-ci/pr:** <a href="https://travis-ci.com/club/mate/builds/77480025"><img src="https://travis-ci.com/images/stroke-icons/icon-passed.png" height="11"> The build</a> **passed**.')
  })
})
