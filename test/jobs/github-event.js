const { resolve } = require('path')

const { test } = require('tap')

const proxyquire = require('proxyquire').noCallThru()

test('github-event index', t => {
  t.plan(2)

  const worker = proxyquire('../../jobs/github-event.js', {
    [resolve(__dirname, '../../jobs/github-event/foo')]: () => t.pass(),
    [resolve(__dirname, '../../jobs/github-event/foo/bar')]: () => t.pass()
  })

  worker({ type: 'foo' })
  worker({ type: 'foo', action: 'bar' }, '456')
})
