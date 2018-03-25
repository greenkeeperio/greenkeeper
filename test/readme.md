# Welcome to greenkeeper tests.
Greenkeeper uses [Jest](https://facebook.github.io/jest/) for testing.
## Setup
Jest's configuration is defined in the package.json file. Here are the [options](https://facebook.github.io/jest/docs/en/configuration.html#options) to control Jest's behavior.
```
"jest": {
    "testRegex": "/test/.*\\.js$",
    "testPathIgnorePatterns": [
      "/test/helpers/.*\\.js$"
    ],
    "collectCoverage": true,
    "setupFiles": [
      "<rootDir>/test/helpers/setup-nock.js"
     ],
    "testEnvironment": "node"
  },
```
- **testRegex**
    By default Jest looks for files inside of `__tests__` folders. It will also find files called `test.js` or `spec.js`. We need this regex to Jets can find and run our tests. We want Jest to to detect our test files in the `test` folder.
- **testPathIgnorePatterns**
    is an Array of (regexp pattern strings) files in our test folder, we don't want to test (e.g. our helpers)
- **collectCoverage**
    Jest can collect code coverage information from entire projects, including untested files. Easily create code coverage reports with `collectCoverage: true`
- **testEnvironment**
    The test environment that will be used for testing. The default environment in Jest is a browser-like environment through jsdom. We use the node option to use a node-like environment instead.
- **setupFiles**
    The paths to modules that run some code to configure or set up the testing environment **before each test**.   
    Since every test runs in its own environment, these scripts will be executed in the testing environment immediately before executing the test code itself.
- **globalSetup**
    *not implemented yet* (This option allows the use of a custom global setup module which exports an async function that is triggered **once before all test suites**.)
- **globalTeardown**
    *not implemented yet* (This option allows the use of a custom global teardown module which exports an async function that is triggered **once after all test suites**.)

#### StandardJS
To support standardjs in test files, we need this configuration:
```
  "standard": {
    "env": {
      "jest": true
    },
    "globals": [ "jest", "expect", "describe", "test", "beforeAll", "beforeEach", "afterAll", "afterEach"],
    ...
```
Jest put their functions (e.g. describe, test) on the global object. Since these functions are not defined or require'd anywhere in your code, standard will warn that you're using a variable that is not defined. But we want to disable it for these global variables.

## Run
Run your tests with
```sh
  npm test
```

## Test
#### Api
Jest puts each of these [methods and objects](https://facebook.github.io/jest/docs/en/api.html) into the global environment. We don't have to require or import anything to use them.
(`test, test.only, test.skip, describe, beforeEach, beforeAll, afterEach, afterAll`)

#### Matchers
[Expect](https://facebook.github.io/jest/docs/en/expect.html) gives you access to a number of "matchers" that let you validate different things.

#### Jest Object
The [jest object](https://facebook.github.io/jest/docs/en/jest-object.html) is automatically in scope within every test file. The methods in the jest object help create mocks and let you control Jest's overall behavior.
Below are the one we use.

**jest.mock()**
 Mocks a module with an auto-mocked version when it is being required. factory and options are optional. Modules that are mocked with `jest.mock` are mocked only for the file that calls `jest.mock`. Another file that imports the module will get the original implementation even if run after the test file that mocks the module.
 [See example](https://facebook.github.io/jest/docs/en/jest-object.html#jestmockmodulename-factory-options)   

**jest.resetModules()**   
Resets the module registry - the cache of all required modules. This is useful to isolate modules where local state might conflict between tests.
[See example](https://facebook.github.io/jest/docs/en/jest-object.html#jestresetmodules)    
**jest.clearAllMocks()**   
Clears the `mock.calls` and `mock.instances` properties of all mocks. Equivalent to calling `.mockClear()` on every mocked function.

## Use Cases
<details>
  <summary> How to mock relative dependencies </summary>
  In this example the `getInfos-worker` uses the `getDiffCommits()` function from `lib/get-diff-commits`.
  We mock the diffCommits(), called in getInfos():

  ```
    jest.mock('../../lib/get-diff-commits', () => () => {
      return 'diff commits'
    })
    const getInfos = require('../../lib/get-infos') // <-- called after jest.mock()
  ```
You can see that we use the **path relative to the test file** to mock the dependency.
</details>
<details>
  <summary> How to mock only one function of a dependency </summary>
  To mock only specific modules, use require.requireActual to restore the original modules,
  then overwrite the one you want to mock.

  In this example we only want to mock the `getActiveBilling()` from `payments`, which is called in `updatePayments`.
  You can see that we use the **path relative to the test file** to mock the dependency.github-event
  ```
  jest.mock('../../lib/payments', () => {
    const payments = require.requireActual('../../lib/payments')
    payments.getActiveBilling = async() => {
      return {
        plan: 'personal',
        stripeSubscriptionId: 'stripe123',
        stripeItemId: 'si123'
      }
    }
    return payments
  })
  const updatePayments = require('../../jobs/update-payments') // <-- called after jest.mock()
```
</details>
<details>
  <summary> How to mock a function call and test the given parameters </summary>
  In this example we want to mock a dependency-function an check if the given parameters are exepted.
  The `githubEvent` calls the `resolve`-function with specific parameters. The `resolve`-function comes from an external module.
  
  ```
  jest.mock('path', () => {
      return {
        resolve: (dirname, eventType, type, action) => {
          // resolve should be called with /foo/bar
          expect(`${dirname}/${eventType}/${type}/${action}`).toEqual(`${dirname}/github-event/foo/bar`)
          return dirname
        }
       }
  })
  const githubEvent = require('../../jobs/github-event.js')
```
</details>
