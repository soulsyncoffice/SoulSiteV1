import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getVoiceCallAvailability,
  validateCuratedActivities,
  validateCuratedActivity,
  validateDailyIcebreaker,
  validatePlainText,
  validateProposalDraft,
  validateProposalRecord,
  validateProposalRecords,
} from './contracts.js'

test('validates paired daily prompt identifiers, dates, and bounded text', () => {
  assert.deepEqual(validateDailyIcebreaker({
    id: 'prompt-1',
    date: '2026-10-19',
    prompt: 'What made you smile today?',
  }), {
    id: 'prompt-1',
    date: '2026-10-19',
    prompt: 'What made you smile today?',
  })
  assert.throws(() => validateDailyIcebreaker({ id: 'x', date: '2026-02-30', prompt: 'Hi' }), /valid calendar date/)
  assert.throws(() => validatePlainText('<img>', 'Answer', 3), /3 characters or fewer/)
  assert.throws(() => validatePlainText('bad\u0000text', 'Answer', 20), /control characters/)
})

test('validates curated activities and proposal input/output shapes', () => {
  const activity = validateCuratedActivity({
    id: 'museum-walk',
    title: 'Museum visit',
    description: 'Choose a small exhibition and explore at your own pace.',
    durationMinutes: 90,
  })
  assert.equal(activity.durationMinutes, 90)
  assert.throws(() => validateCuratedActivity({ id: 'bad id', title: 'Walk', description: 'Outside' }), /identifier/)
  assert.throws(() => validateCuratedActivities({}), /array/)

  assert.deepEqual(validateProposalDraft({
    activityId: 'museum-walk',
    note: 'A quiet afternoon',
    proposedAt: '2026-10-20T17:30',
  }), {
    activityId: 'museum-walk',
    note: 'A quiet afternoon',
    proposedAt: '2026-10-20T17:30',
  })
  assert.throws(() => validateProposalDraft({ activityId: 'museum-walk', note: 'x'.repeat(501) }), /500 characters/)
  assert.throws(() => validateProposalRecord({
    id: 'proposal-1',
    activityId: 'museum-walk',
    status: 'confirmed',
  }), /status is invalid/)
  assert.deepEqual(validateProposalRecords([{
    id: 'proposal-1',
    activityId: 'museum-walk',
    status: 'pending',
  }])[0].permissions, { canRespond: false, canCancel: false })
  assert.throws(() => validateProposalRecord({
    id: 'proposal-1',
    activityId: 'museum-walk',
    status: 'pending',
    permissions: { canRespond: 'yes' },
  }), /explicit booleans/)
})

test('voice calls fail closed without every provider, entitlement, and consent signal', () => {
  assert.equal(getVoiceCallAvailability(undefined).available, false)
  assert.equal(getVoiceCallAvailability({
    providerReady: true,
    mediaConfigured: true,
    entitled: true,
    mutualConsent: false,
    providerId: 'provider-x',
  }).available, false)
  assert.deepEqual(getVoiceCallAvailability({
    providerReady: true,
    mediaConfigured: true,
    entitled: true,
    mutualConsent: true,
    providerId: 'vetted.provider-1',
  }), { available: true, providerId: 'vetted.provider-1' })
})
