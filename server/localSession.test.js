import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createLocalAuth } from './localSession.js'

function auth() {
  return createLocalAuth(new Database(':memory:'))
}

test('admin sign-in unlocks every plan and feature', () => {
  const local = auth()
  const session = local.login('Admin', '5051')
  assert.equal(session.error, undefined)
  assert.equal(session.user.role, 'admin')
  assert.equal(session.user.features.allPlans, true)
  assert.equal(session.user.features.calls, true)
  assert.equal(session.user.plans.Unlimited.yesLimit, null)
  assert.equal(local.readToken(session.token).username, 'Admin')
})

test('admin password is not accepted for a lookalike name', () => {
  const result = auth().login('admin', '5051')
  assert.match(result.error, /do not match/)
})

test('local accounts can register and return with the same token', () => {
  const local = auth()
  const created = local.register({
    username: 'River',
    password: 'lantern-path',
    age: 29,
    adultConfirmed: true,
  })
  assert.equal(created.user.role, 'member')
  assert.equal(created.user.features.allPlans, false)
  assert.equal(local.readToken(created.token).username, 'River')
  assert.match(local.register({ username: 'Admin', password: 'lantern-path', age: 29, adultConfirmed: true }).error, /reserved/)
})
