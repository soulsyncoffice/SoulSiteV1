export const CONNECTION_INTENTS = Object.freeze([
  'friendship',
  'dating',
  'long-term',
  'open-to-exploring',
])

export const SAFETY_REPORT_CATEGORIES = Object.freeze([
  'harassment',
  'boundary-violation',
  'impersonation',
  'safety-concern',
  'other',
])

export const AREA_CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000

const MAX_TAGS = 12
const MAX_TAG_LENGTH = 48
const MAX_JOURNAL_LENGTH = 12000
const MAX_REPORT_LENGTH = 2000

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
}

function toIso(value, label) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid date.`)
  return date.toISOString()
}

function normalizeText(value, label, maxLength, { required = false } = {}) {
  if (typeof value !== 'string') {
    if (required) throw new TypeError(`${label} is required.`)
    return ''
  }
  const text = value.trim()
  if (required && !text) throw new TypeError(`${label} is required.`)
  if (text.length > maxLength) throw new RangeError(`${label} must be ${maxLength} characters or fewer.`)
  return text
}

function normalizeTags(value, label) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a list.`)
  if (value.length > MAX_TAGS) throw new RangeError(`${label} can contain at most ${MAX_TAGS} items.`)

  const tags = value.map((tag) => normalizeText(tag, `${label} item`, MAX_TAG_LENGTH, { required: true }))
  return [...new Set(tags)]
}

export function validateDiscoveryPreferences(preferences) {
  requireObject(preferences, 'Preferences')
  const connectionIntent = preferences.connectionIntent || 'open-to-exploring'
  if (!CONNECTION_INTENTS.includes(connectionIntent)) {
    throw new TypeError('Choose a supported connection intention.')
  }

  return {
    connectionIntent,
    musicGenres: normalizeTags(preferences.musicGenres, 'Music preferences'),
    cultureInterests: normalizeTags(preferences.cultureInterests, 'Culture interests'),
    hobbies: normalizeTags(preferences.hobbies, 'Hobbies'),
  }
}

function normalizeCoarseArea(value) {
  const areaLabel = normalizeText(value, 'Broad area', 64, { required: true })
  const hasCoordinates = /-?\d{1,3}\.\d+\s*[,/]\s*-?\d{1,3}\.\d+/.test(areaLabel)
  const hasStreetAddress = /\b\d{1,6}[A-Za-z]?\s+[\p{L}\d.'-]+\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/iu.test(areaLabel)
  const hasPostalCode = /\b\d{5}(?:-\d{4})?\b/.test(areaLabel)
  if (hasCoordinates || hasStreetAddress || hasPostalCode) {
    throw new TypeError('Use a city or broad region only; addresses, coordinates, and postal codes are not accepted.')
  }
  return areaLabel
}

export function grantAreaConsent(areaLabel, { now = new Date(), ttlMs = AREA_CONSENT_TTL_MS } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('Consent duration must be positive.')
  const consentedAt = toIso(now, 'Consent time')
  return {
    areaLabel: normalizeCoarseArea(areaLabel),
    consentedAt,
    expiresAt: new Date(new Date(consentedAt).getTime() + ttlMs).toISOString(),
    revokedAt: null,
  }
}

export function isAreaConsentActive(consent, now = new Date()) {
  if (!consent || typeof consent !== 'object' || consent.revokedAt || !consent.areaLabel) return false
  const currentTime = new Date(now).getTime()
  const expiresAt = new Date(consent.expiresAt).getTime()
  const consentedAt = new Date(consent.consentedAt).getTime()
  return Number.isFinite(currentTime)
    && Number.isFinite(expiresAt)
    && Number.isFinite(consentedAt)
    && consentedAt <= currentTime
    && expiresAt > currentTime
}

export function revokeAreaConsent(consent, now = new Date()) {
  return {
    areaLabel: null,
    consentedAt: null,
    expiresAt: null,
    revokedAt: toIso(now, 'Revocation time'),
  }
}

export function projectDiscoveryProfile(profile, now = new Date()) {
  requireObject(profile, 'Profile')
  const profileId = normalizeText(profile.profileId, 'Profile reference', 128, { required: true })
  const intent = CONNECTION_INTENTS.includes(profile.connectionIntent)
    ? profile.connectionIntent
    : 'open-to-exploring'

  return {
    profileId,
    displayName: normalizeText(profile.displayName, 'Display name', 60) || 'SoulSite member',
    connectionIntent: intent,
    musicGenres: normalizeTags(profile.musicGenres, 'Music preferences'),
    cultureInterests: normalizeTags(profile.cultureInterests, 'Culture interests'),
    hobbies: normalizeTags(profile.hobbies, 'Hobbies'),
    area: isAreaConsentActive(profile.areaConsent, now)
      ? normalizeCoarseArea(profile.areaConsent.areaLabel)
      : null,
  }
}

export function projectDiscoveryProfiles(profiles, blockedProfileIds = [], now = new Date()) {
  if (!Array.isArray(profiles)) throw new TypeError('Discovery profiles must be a list.')
  if (!Array.isArray(blockedProfileIds)) throw new TypeError('Blocked profile references must be a list.')

  const blocked = new Set(blockedProfileIds.filter((id) => typeof id === 'string'))
  const projected = []
  for (const profile of profiles) {
    try {
      const safeProfile = projectDiscoveryProfile(profile, now)
      if (!blocked.has(safeProfile.profileId)) projected.push(safeProfile)
    } catch {
      // Invalid candidate data is excluded rather than partially exposed.
    }
  }
  return projected
}

export function rankProfilesBySharedHobbies(profiles, ownHobbies = []) {
  if (!Array.isArray(profiles)) throw new TypeError('Discovery profiles must be a list.')
  const own = new Set(normalizeTags(ownHobbies, 'Hobbies').map((hobby) => hobby.toLocaleLowerCase()))
  return profiles
    .map((profile, index) => ({
      profile,
      index,
      matches: profile.hobbies.filter((hobby) => own.has(hobby.toLocaleLowerCase())).length,
    }))
    .sort((left, right) => right.matches - left.matches || left.index - right.index)
    .map(({ profile }) => profile)
}

export function createDateSafetyPlan({
  meetupLabel,
  expectedCheckInAt,
  trustedContact = null,
  now = new Date(),
}) {
  const meeting = normalizeText(meetupLabel, 'Meet-up label', 100, { required: true })
  const checkInAt = toIso(expectedCheckInAt, 'Check-in time')
  if (new Date(checkInAt).getTime() <= new Date(toIso(now, 'Current time')).getTime()) {
    throw new TypeError('Check-in time must be in the future.')
  }

  let contact = null
  if (trustedContact != null) {
    requireObject(trustedContact, 'Trusted contact')
    const name = normalizeText(trustedContact.name, 'Trusted contact name', 80, { required: true })
    const contactMethod = normalizeText(trustedContact.contactMethod, 'Trusted contact method', 160, { required: true })
    contact = { name, contactMethod }
  }

  return {
    meetupLabel: meeting,
    expectedCheckInAt: checkInAt,
    trustedContact: contact,
    visibility: 'private',
  }
}

export function createSafetyCheckIn(status, now = new Date()) {
  if (status !== 'safe' && status !== 'need-support') {
    throw new TypeError('Choose a supported check-in status.')
  }
  return { status, submittedAt: toIso(now, 'Check-in time') }
}

export function createSafetyReport({ targetProfileId, category, details = '' }) {
  const target = normalizeText(targetProfileId, 'Profile reference', 128, { required: true })
  if (!SAFETY_REPORT_CATEGORIES.includes(category)) throw new TypeError('Choose a supported report category.')
  return {
    targetProfileId: target,
    category,
    details: normalizeText(details, 'Report details', MAX_REPORT_LENGTH),
    visibility: 'private',
  }
}

export function createPrivateJournalEntry({ content, createdAt = new Date() }) {
  return {
    content: normalizeText(content, 'Journal entry', MAX_JOURNAL_LENGTH, { required: true }),
    createdAt: toIso(createdAt, 'Entry time'),
    visibility: 'private',
  }
}
