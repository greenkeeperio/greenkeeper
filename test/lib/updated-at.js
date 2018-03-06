const updatedAt = require('../../lib/updated-at')

test('set updatedAt and createdAt to timestamp', () => {
  const doc = { _id: '1' }
  const updatedDoc = updatedAt(doc)

  expect(updatedDoc._id).toEqual('1')
  expect(updatedDoc.createdAt).toHaveLength(24)
  expect(updatedDoc.updatedAt).toHaveLength(24)
})

test('set updatedAt to timestamp', () => {
  const doc = {
    _id: '1',
    createdAt: 'now',
    updatedAt: 'now'
  }
  const updatedDoc = updatedAt(doc)
  expect(updatedDoc._id).toEqual('1')
  expect(updatedDoc.createdAt).toEqual('now')
  expect(updatedDoc.updatedAt).toHaveLength(24)
})

test('set updatedAt to timestamp array', () => {
  const doc = {
    _id: '1',
    createdAt: 'now',
    updatedAt: ['now']
  }
  const updatedDoc = updatedAt(doc)
  expect(updatedDoc._id).toEqual('1')
  expect(updatedDoc.createdAt).toEqual('now')
  expect(updatedDoc.updatedAt instanceof Array).toBeTruthy()
  expect(updatedDoc.updatedAt).toHaveLength(2)
  expect(updatedDoc.updatedAt[0]).toEqual('now')
  expect(updatedDoc.updatedAt[1]).toHaveLength(24)
})

test('set updatedAt to timestamp object array', () => {
  const doc = { _id: '1' }
  const updatedDoc = updatedAt(doc, 'update user')
  expect(updatedDoc._id).toEqual('1')
  expect(updatedDoc.createdAt).toHaveLength(24)
  expect(updatedDoc.updatedAt instanceof Array).toBeTruthy()
  expect(updatedDoc.updatedAt).toHaveLength(1)
  expect(updatedDoc.updatedAt[0].timestamp).toHaveLength(24)
  expect(updatedDoc.updatedAt[0].event).toEqual('update user')
})
