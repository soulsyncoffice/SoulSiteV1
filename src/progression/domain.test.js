import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALIGNMENT_DIMENSIONS,
  ICEBREAKER_PROMPTS,
  calculateExplainableAlignment,
  canAccessCooperativeEvent,
  chooseIcebreakerPrompt,
  hasMutualConsent,
  retractPrivateReflection,
  savePrivateReflection,
  sendFeedback,
  sendSafetyReport,
  transitionMutualProgression,
  validateCooperativeEvent,
} from './domain.js'

const approved = async () => ({ status: 'approved' })
const preferences = (value) => Object.fromEntries(ALIGNMENT_DIMENSIONS.map(({ id }) => [id, value]))

test('icebreaker prompt selection is deterministic, passable, and finite', () => {
  const first = chooseIcebreakerPrompt(5)
  assert.deepEqual(chooseIcebreakerPrompt(5), first)
  assert.notEqual(chooseIcebreakerPrompt(5, [first.id]).id, first.id)
  assert.equal(chooseIcebreakerPrompt(1, ICEBREAKER_PROMPTS.map(({ id }) => id)), null)
  assert.throws(() => chooseIcebreakerPrompt(1.5), /safe integer/)
})

test('private reflection validates, requires explicit moderation approval, saves and retracts by date only', async () => {
  const saved = []
  const retracted = []
  await savePrivateReflection(
    { day: '2026-10-19', text: '  A quiet win.  ' },
    { moderateText: approved, onSave: async (entry) => saved.push(entry) },
  )
  await retractPrivateReflection('2026-10-19', async (entry) => retracted.push(entry))
  assert.deepEqual(saved, [{ day: '2026-10-19', text: 'A quiet win.' }])
  assert.deepEqual(retracted, [{ day: '2026-10-19' }])
  await assert.rejects(
    savePrivateReflection({ day: '2026-02-30', text: 'valid text' }, { moderateText: approved, onSave: async () => {} }),
    /valid calendar date/,
  )
  await assert.rejects(
    savePrivateReflection({ day: '2026-10-19', text: 'blocked' }, { moderateText: async () => ({ status: 'unknown' }), onSave: async () => {} }),
    /not approved/,
  )
  await assert.rejects(
    savePrivateReflection({ day: '2026-10-19', text: 'valid text' }, { moderateText: approved }),
    /authenticated application adapter/,
  )
})

test('mutual progression requires both consent flags and supports withdrawal and ending', () => {
  const requested = transitionMutualProgression(
    { status: 'inactive', selfConsent: false, partnerConsent: false },
    { type: 'request' },
  )
  assert.deepEqual(requested, { status: 'pending', selfConsent: true, partnerConsent: false })
  const mutuallyAccepted = transitionMutualProgression(
    { status: 'pending', selfConsent: true, partnerConsent: true },
    { type: 'request' },
  )
  assert.equal(mutuallyAccepted.status, 'active')
  assert.equal(hasMutualConsent(mutuallyAccepted), true)
  const withdrawn = transitionMutualProgression(mutuallyAccepted, { type: 'retract' })
  assert.deepEqual(withdrawn, { status: 'pending', selfConsent: false, partnerConsent: true })
  const ended = transitionMutualProgression(mutuallyAccepted, { type: 'end' })
  assert.equal(ended.status, 'ended')
  assert.throws(() => transitionMutualProgression(ended, { type: 'request' }), /cannot be changed/)
  assert.equal(hasMutualConsent({ ...mutuallyAccepted, partnerConsent: false }), false)
})

test('cooperative event validation and access fail closed without private mutual consent', () => {
  const event = {
    id: 'walk',
    visibility: 'private',
    steps: [{ id: 'choose-route', label: 'Choose a route together' }],
  }
  assert.equal(validateCooperativeEvent(event), event)
  assert.equal(canAccessCooperativeEvent(event, { status: 'pending', selfConsent: true, partnerConsent: false }), false)
  assert.equal(canAccessCooperativeEvent(event, { status: 'active', selfConsent: true, partnerConsent: true }), true)
  assert.equal(canAccessCooperativeEvent({ ...event, visibility: 'public' }, { status: 'active', selfConsent: true, partnerConsent: true }), false)
  assert.throws(() => validateCooperativeEvent({ ...event, steps: [{ id: 'same', label: 'One' }, { id: 'same', label: 'Two' }] }), /unique/)
})

test('alignment score is deterministic, explainable, and bounded to stated preferences', () => {
  const exact = calculateExplainableAlignment(preferences(3), preferences(3))
  const opposite = calculateExplainableAlignment(preferences(1), preferences(5))
  assert.equal(exact.score, 100)
  assert.equal(opposite.score, 0)
  assert.equal(exact.dimensions.length, ALIGNMENT_DIMENSIONS.length)
  assert.ok(exact.dimensions.every(({ explanation }) => explanation.includes('same preference')))
  assert.match(exact.disclaimer, /not a prediction, ranking, or measure/)
  assert.throws(() => calculateExplainableAlignment({ ...preferences(2), socialEnergy: 6 }, preferences(2)), /integer from 1 to 5/)
})

test('feedback and safety reporting reject unapproved text and accept category-only reports', async () => {
  const feedback = []
  const reports = []
  await sendFeedback(' Useful suggestion ', { moderateText: approved, onFeedback: async (value) => feedback.push(value) })
  await sendSafetyReport({ category: 'harassment' }, { onReport: async (value) => reports.push(value) })
  assert.deepEqual(feedback, [{ text: 'Useful suggestion' }])
  assert.deepEqual(reports, [{ category: 'harassment', details: '' }])
  await assert.rejects(
    sendFeedback('unreviewed', { onFeedback: async () => {} }),
    /moderateText must be provided/,
  )
  await assert.rejects(
    sendSafetyReport({ category: 'harassment', details: 'quoted text' }, {
      moderateText: async () => ({ status: 'rejected' }),
      onReport: async () => {},
    }),
    /not approved/,
  )
  await assert.rejects(
    sendSafetyReport({ category: 'free-form-target' }, { onReport: async () => {} }),
    /supported safety-report category/,
  )
})
