import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AREA_CONSENT_TTL_MS,
  createDateSafetyPlan,
  createPrivateJournalEntry,
  createSafetyCheckIn,
  createSafetyReport,
  grantAreaConsent,
  isAreaConsentActive,
  projectDiscoveryProfile,
  projectDiscoveryProfiles,
  rankProfilesBySharedHobbies,
  revokeAreaConsent,
  validateDiscoveryPreferences,
} from './domain.js'
import { CLOSURE_TEMPLATES, TRUST_REFLECTION_PROMPTS } from './communication.js'

const now = new Date('2026-01-01T00:00:00.000Z')

test('discovery projection is a strict allowlist and excludes appearance and sensitive fields', () => {
  const profile = projectDiscoveryProfile({
    profileId: 'profile-1',
    displayName: 'Rin',
    connectionIntent: 'friendship',
    musicGenres: ['jazz'],
    cultureInterests: ['film'],
    hobbies: ['hiking'],
    areaConsent: grantAreaConsent('North London', { now }),
    photoUrl: 'https://example.invalid/photo.jpg',
    appearance: 'private description',
    preciseLocation: { latitude: 51.5, longitude: -0.1 },
    report: { details: 'private report' },
    trustedContact: { contactMethod: 'private number' },
    journal: 'private reflection',
    arbitraryServerField: 'must not leak',
  }, now)

  assert.deepEqual(Object.keys(profile), [
    'profileId',
    'displayName',
    'connectionIntent',
    'musicGenres',
    'cultureInterests',
    'hobbies',
    'area',
  ])
  assert.equal(profile.area, 'North London')
  assert.equal(JSON.stringify(profile).includes('private'), false)
  assert.equal(JSON.stringify(profile).includes('photo'), false)
})

test('discovery fails closed for expired, revoked, malformed, and precise area consent', () => {
  const consent = grantAreaConsent('Central district', { now })
  assert.equal(isAreaConsentActive(consent, new Date(now.getTime() + AREA_CONSENT_TTL_MS)), false)
  assert.equal(projectDiscoveryProfile({ profileId: 'a', areaConsent: consent }, new Date(now.getTime() + AREA_CONSENT_TTL_MS)).area, null)
  assert.equal(projectDiscoveryProfile({ profileId: 'b', areaConsent: revokeAreaConsent(consent, now) }, now).area, null)
  assert.equal(projectDiscoveryProfile({ profileId: 'c', areaConsent: { areaLabel: 'Somewhere', expiresAt: 'invalid', consentedAt: now.toISOString() } }, now).area, null)
  assert.throws(() => grantAreaConsent('51.5007, -0.1246', { now }), /coordinates/)
  assert.throws(() => grantAreaConsent('221B Baker Street', { now }), /broad region/)
  assert.throws(() => grantAreaConsent('90210', { now }), /postal codes/)
})

test('area consent grant expires at the configured maximum and can be revoked', () => {
  const consent = grantAreaConsent('Portland', { now })
  assert.equal(new Date(consent.expiresAt).getTime() - new Date(consent.consentedAt).getTime(), AREA_CONSENT_TTL_MS)
  assert.equal(isAreaConsentActive(consent, now), true)
  const revoked = revokeAreaConsent(consent, now)
  assert.equal(revoked.areaLabel, null)
  assert.equal(isAreaConsentActive(revoked, now), false)
})

test('blocked and malformed discovery profiles are not returned', () => {
  const results = projectDiscoveryProfiles([
    { profileId: 'allowed', displayName: 'Visible', appearance: 'not projected' },
    { profileId: 'blocked', displayName: 'Hidden' },
    { profileId: 'invalid', musicGenres: 'not an array' },
  ], ['blocked'], now)
  assert.deepEqual(results.map((profile) => profile.profileId), ['allowed'])
  assert.equal(JSON.stringify(results).includes('not projected'), false)
})

test('discovery ranks shared hobbies first and keeps stable ordering for ties', () => {
  const ranked = rankProfilesBySharedHobbies([
    { profileId: 'none', hobbies: ['reading'] },
    { profileId: 'one', hobbies: ['Cooking'] },
    { profileId: 'two', hobbies: ['cooking', 'Hiking'] },
    { profileId: 'tie', hobbies: ['hiking'] },
  ], ['Cooking', 'Hiking'])
  assert.deepEqual(ranked.map((profile) => profile.profileId), ['two', 'one', 'tie', 'none'])
})

test('preference validation constrains intentions and bounded interest lists', () => {
  assert.deepEqual(validateDiscoveryPreferences({
    connectionIntent: 'friendship',
    musicGenres: [' jazz ', 'jazz'],
    cultureInterests: ['independent film'],
    hobbies: [],
  }), {
    connectionIntent: 'friendship',
    musicGenres: ['jazz'],
    cultureInterests: ['independent film'],
    hobbies: [],
  })
  assert.throws(() => validateDiscoveryPreferences({ connectionIntent: 'anything' }), /connection intention/)
  assert.throws(() => validateDiscoveryPreferences({ hobbies: Array(13).fill('hobby') }), /at most 12/)
})

test('private journal payload has only private content and creation time, never an owner ID', () => {
  const entry = createPrivateJournalEntry({ content: 'A reflection', createdAt: now })
  assert.deepEqual(entry, {
    content: 'A reflection',
    createdAt: now.toISOString(),
    visibility: 'private',
  })
  assert.equal('userId' in entry, false)
  assert.throws(() => createPrivateJournalEntry({ content: ' ' }), /required/)
})

test('safety plan contact details are private and check-in times must be in the future', () => {
  const plan = createDateSafetyPlan({
    meetupLabel: 'Coffee',
    expectedCheckInAt: new Date(now.getTime() + 60 * 60 * 1000),
    trustedContact: { name: 'Ari', contactMethod: 'private contact channel' },
    now,
  })
  assert.equal(plan.visibility, 'private')
  assert.deepEqual(plan.trustedContact, { name: 'Ari', contactMethod: 'private contact channel' })
  assert.throws(() => createDateSafetyPlan({ meetupLabel: 'Coffee', expectedCheckInAt: now, now }), /future/)
})

test('check-in payloads contain only an allowlisted status and timestamp', () => {
  assert.deepEqual(createSafetyCheckIn('need-support', now), {
    status: 'need-support',
    submittedAt: now.toISOString(),
  })
  assert.throws(() => createSafetyCheckIn('share-location', now), /check-in status/)
})

test('safety reports are private allowlisted payloads and reject unsupported categories', () => {
  const report = createSafetyReport({ targetProfileId: 'target-1', category: 'harassment', details: 'Please review privately.' })
  assert.deepEqual(report, {
    targetProfileId: 'target-1',
    category: 'harassment',
    details: 'Please review privately.',
    visibility: 'private',
  })
  assert.equal('userId' in report, false)
  assert.throws(() => createSafetyReport({ targetProfileId: 'target-1', category: 'unknown' }), /report category/)
})

test('closure prompts provide concise, editable boundary and closure options', () => {
  assert.ok(CLOSURE_TEMPLATES.some((template) => template.id === 'not-a-fit'))
  assert.ok(CLOSURE_TEMPLATES.some((template) => template.id === 'need-space'))
  assert.ok(CLOSURE_TEMPLATES.every((template) => template.message.length < 300))
  assert.equal(TRUST_REFLECTION_PROMPTS.length, 3)
})
