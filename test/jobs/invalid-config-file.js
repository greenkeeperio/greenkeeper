describe('invalid-config-file', async () => {
  beforeEach(() => {
    jest.resetModules()
    jest.mock('../../lib/gk-kit')
  })

  jest.mock('../../lib/dbs')

  test('create new issue', async () => {
    expect.assertions(6)
    const kit = require('../../lib/gk-kit')
    kit.mockImplementation((accountId) => ({
      repositories: (repositoryId) => ({
        issues: {
          getInvalidConfigIssueNumber: () => undefined,
          create: (title, body, issueDoc) => {
            expect(accountId).toEqual('2020')
            expect(repositoryId).toEqual('invalid-config1')
            expect(title).toEqual('Invalid Greenkeeper configuration file')
            expect(body).toMatch('The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).')
            expect(body).not.toMatch(/which is preventing Greenkeeper from opening its initial pull request/)
            expect(issueDoc).toMatchObject({
              initial: false,
              invalidConfig: true
            })
          }
        }
      })
    }))

    const invalidConfigFile = require('../../jobs/invalid-config-file')

    await invalidConfigFile({
      repositoryId: 'invalid-config1',
      accountId: '2020',
      messages: ['The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).']
    })
  })

  test('an open issue already exists', async () => {
    expect.assertions(3)
    const kit = require('../../lib/gk-kit')
    kit.mockImplementation((accountId) => ({
      repositories: (repositoryId) => {
        expect(accountId).toEqual('2121')
        expect(repositoryId).toEqual('invalid-config2')
        return {
          issues: {
            getInvalidConfigIssueNumber: () => 12
          }
        }
      }
    }))

    const invalidConfigFile = require('../../jobs/invalid-config-file')

    await expect(invalidConfigFile({
      repositoryId: 'invalid-config2',
      accountId: '2121'
    })).rejects.toThrow('Repo already has an open issue')
  })

  test('create new issue with reference to delayed initial PR', async () => {
    expect.assertions(8)
    const kit = require('../../lib/gk-kit')
    kit.mockImplementation((accountId) => ({
      repositories: (repositoryId) => ({
        issues: {
          getInvalidConfigIssueNumber: () => undefined,
          create: (title, body, issueDoc) => {
            expect(accountId).toEqual('2020')
            expect(repositoryId).toEqual('invalid-config4')
            expect(title).toEqual('Invalid Greenkeeper configuration file')
            expect(body).toMatch(/We found the following issue:/)
            expect(body).toMatch(/1. The group name `#invalid#groupname#` is invalid./)
            expect(body).toMatch(/which is preventing Greenkeeper from opening its initial pull request/)
            expect(body).toMatch(/so Greenkeeper can run on this repository/)
            expect(issueDoc).toMatchObject({
              initial: false,
              invalidConfig: true
            })
          }
        }
      })
    }))

    const invalidConfigFile = require('../../jobs/invalid-config-file')

    await invalidConfigFile({
      repositoryId: 'invalid-config4',
      accountId: '2020',
      messages: ['The group name `#invalid#groupname#` is invalid. Group names may only contain alphanumeric characters and underscores (a-zA-Z_).'],
      isBlockingInitialPR: true
    })
  })
})
