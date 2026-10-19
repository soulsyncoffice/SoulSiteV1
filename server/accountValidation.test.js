import assert from 'node:assert/strict'
import test from 'node:test'
import { isAdultAccount } from './accountValidation.js'

test('adult account access requires an explicit confirmation and valid age', () => {
  assert.equal(isAdultAccount({ user_metadata: { adult_confirmed: true, age: 18 } }), true)
  assert.equal(isAdultAccount({ user_metadata: { adult_confirmed: true, age: 17 } }), false)
  assert.equal(isAdultAccount({ user_metadata: { adult_confirmed: 'true', age: 21 } }), false)
  assert.equal(isAdultAccount({ user_metadata: { adult_confirmed: true, age: 'not-an-age' } }), false)
  assert.equal(isAdultAccount(null), false)
})
