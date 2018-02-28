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
    "unmockedModulePathPatterns": [
      "<rootDir>/node_modules/nock"
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
    (Because this retrofits all executed files with coverage collection statements, it may significantly slow down your tests.)
- **unmockedModulePathPatterns**
    An array of regexp pattern strings that are matched against all modules before the module loader will automatically return a mock for them. If a module's path matches any of the patterns in this list, it will not be automatically mocked by the module loader.
- **testEnvironment**
    The test environment that will be used for testing. The default environment in Jest is a browser-like environment through jsdom. We use the node option to use a node-like environment instead.
- **globalSetup** (This option allows the use of a custom global setup module which exports an async function that is triggered once before all test suites.)
- **globalteardown** (This option allows the use of a custom global teardown module which exports an async function that is triggered once after all test suites.)

#### StandardJS
To support standardjs in test files, we need this configuration:
```
  "standard": {
    "env": {
      "jest": true
    },
    "globals": [ "jest", "expect", "describe", "test", "beforeAll", "beforeEach", "afterAll", "aftereach"],
    ...
```
Jest put their functions (e.g. describe, test) on the global object. Since these functions are not defined or require'd anywhere in your code, standard will warn that you're using a variable that is not defined. But we want to disable it for these global variables.

## Run
run your tests with
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
