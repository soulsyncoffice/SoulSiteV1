import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createIcebreakerState,
  getMutualActivityStatus,
  icebreakerReducer,
  proposalReducer,
} from './state.js'

test('icebreaker reveals only after both submissions and supports skipping before submit', () => {
  let state = createIcebreakerState()
  state = icebreakerReducer(state, { type: 'PARTNER_SUBMITTED' })
  assert.equal(state.phase, 'answering')
  state = icebreakerReducer(state, { type: 'SUBMIT', answer: 'A sunny walk' })
  assert.equal(state.phase, 'revealed')
  assert.equal(state.ownAnswer, 'A sunny walk')
  assert.throws(() => icebreakerReducer(state, { type: 'SKIP' }), /can be skipped/)

  assert.equal(icebreakerReducer(createIcebreakerState(), { type: 'SKIP' }).phase, 'skipped')
  assert.throws(() => icebreakerReducer(createIcebreakerState(), { type: 'SUBMIT', answer: '' }), /required/)
})

test('proposal consent transitions are pending-only', () => {
  assert.equal(proposalReducer('pending', { type: 'ACCEPT' }), 'accepted')
  assert.equal(proposalReducer('pending', { type: 'DECLINE' }), 'declined')
  assert.equal(proposalReducer('pending', { type: 'CANCEL' }), 'cancelled')
  assert.throws(() => proposalReducer('accepted', { type: 'CANCEL' }), /pending/)
})

test('mutual activities become active only with two affirmative consents', () => {
  assert.equal(getMutualActivityStatus({ ownAccepted: false, partnerAccepted: false }), 'proposed')
  assert.equal(getMutualActivityStatus({ ownAccepted: true, partnerAccepted: false }), 'awaiting-partner')
  assert.equal(getMutualActivityStatus({ ownAccepted: false, partnerAccepted: true }), 'invited')
  assert.equal(getMutualActivityStatus({ ownAccepted: true, partnerAccepted: true }), 'active')
  assert.equal(getMutualActivityStatus({ ownAccepted: true, partnerAccepted: true, cancelled: true }), 'cancelled')
  assert.throws(() => getMutualActivityStatus({ ownAccepted: true }), /explicit booleans/)
  assert.throws(() => getMutualActivityStatus({
    ownAccepted: true,
    partnerAccepted: true,
    cancelled: 'true',
  }), /explicit boolean/)
})
