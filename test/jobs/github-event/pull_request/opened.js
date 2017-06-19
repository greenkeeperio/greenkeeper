const { test, tearDown } = require('tap')
const dbs = require('../../../../lib/dbs')
const worker = require('../../../../jobs/github-event/pull_request/opened')

const pullRequestPayLoad = (id, branchName, user) => {
  return {
    installation: {
      id: 37
    },
    pull_request: {
      id,
      merged: false,
      state: 'open',
      head: {
        ref: branchName
      },
      user
    },
    repository: {
      full_name: 'finnp/test',
      id: 42,
      owner: {
        id: 10
      }
    }
  }
}

test('github-event pull_request opened', async t => {
  const { repositories } = await dbs()
  await repositories.put({
    _id: '42',
    enabled: false,
    repositoryId: '42'
  })

  t.test('initial pr opened by user', async t => {
    const newJob = await worker(
      pullRequestPayLoad(666, 'greenkeeper/initial', {
        type: 'User',
        login: 'finnp'
      })
    )

    t.notOk(newJob, 'no new job')
    const pr = await repositories.get('42:pr:666')
    t.is(pr.state, 'open', 'pr status is opened')
    t.is(pr.merged, false, 'pr is not merged')
    t.is(pr.initial, true, 'is initial pr')
    t.ok(pr.createdAt, 'createdAt is set')
    t.is(pr.createdByUser, true, 'pr is created by the user')
    t.end()
  })

  t.test('initial pr opened by greenkeeper', async t => {
    const newJob = await worker(
      pullRequestPayLoad(667, 'greenkeeper/initial', {
        type: 'Bot',
        login: 'greenkeeper[bot]'
      })
    )

    t.notOk(newJob, 'no new job')
    try {
      await repositories.get('42:pr:667')
      t.fail('unexpected prdoc in database')
    } catch (e) {
      t.equals(e.status, 404, 'prdoc was not created')
    }
    t.end()
  })

  t.test('pr opened but is not our initial branch', async t => {
    const newJob = await worker(
      pullRequestPayLoad(668, 'some-random-branch', {
        type: 'User',
        login: 'finnp'
      })
    )

    t.notOk(newJob, 'no new job')
    try {
      await repositories.get('42:pr:668')
      t.fail('unexpected prdoc in database')
    } catch (e) {
      t.equals(e.status, 404, 'prdoc was not created')
    }
    t.end()
  })
})

tearDown(async () => {
  const { repositories } = await dbs()
  await repositories.remove(await repositories.get('42:pr:666'))
  await repositories.remove(await repositories.get('42'))
  const docIds = [667, 668]

  docIds.forEach(async (docId) => {
    try {
      await repositories.remove(await repositories.get(`42:pr:${docId}`))
    } catch (e) {
      if (e.status !== 404) {
        throw e
      }
    }
  })
})
