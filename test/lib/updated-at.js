const { test } = require('tap')

const updatedAt = require('../../lib/updated-at')

test('set updatedAt and createdAt to timestamp', t => {
  const doc = { _id: '1' }
  const updatedDoc = updatedAt(doc)
  t.is(updatedDoc._id, '1')
  t.is(updatedDoc.createdAt.length, 24)
  t.is(updatedDoc.updatedAt.length, 24)
  t.end()
})

test('set updatedAt to timestamp', t => {
  const doc = {
    _id: '1',
    createdAt: 'now',
    updatedAt: 'now'
  }
  const updatedDoc = updatedAt(doc)
  t.is(updatedDoc._id, '1')
  t.is(updatedDoc.createdAt, 'now')
  t.is(updatedDoc.updatedAt.length, 24)
  t.end()
})

test('set updatedAt to timestamp array', t => {
  const doc = {
    _id: '1',
    createdAt: 'now',
    updatedAt: ['now']
  }
  const updatedDoc = updatedAt(doc)
  t.is(updatedDoc._id, '1')
  t.is(updatedDoc.createdAt, 'now')
  t.type(updatedDoc.updatedAt, Array)
  t.is(updatedDoc.updatedAt.length, 2)
  t.is(updatedDoc.updatedAt[0], 'now')
  t.is(updatedDoc.updatedAt[1].length, 24)
  t.end()
})

test('set updatedAt to timestamp object array', t => {
  const doc = { _id: '1' }
  const updatedDoc = updatedAt(doc, 'update user')
  t.is(updatedDoc._id, '1')
  t.is(updatedDoc.createdAt.length, 24)
  t.type(updatedDoc.updatedAt, Array)
  t.is(updatedDoc.updatedAt.length, 1)
  t.is(updatedDoc.updatedAt[0].timestamp.length, 24)
  t.is(updatedDoc.updatedAt[0].event, 'update user')
  t.end()
})
