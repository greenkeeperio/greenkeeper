/*
 * this script will be executed in the testing environment immediately before executing each test.
 */

const nock = require('nock')

nock.cleanAll()

nock.disableNetConnect()
nock.enableNetConnect('localhost')
