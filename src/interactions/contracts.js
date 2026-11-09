const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const PROVIDER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

function hasUnsupportedControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) return true
  }
  return false
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
  return value
}

function requireId(value, label = 'id') {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a valid identifier.`)
  }
  return value
}

export function validatePlainText(value, label, maxLength, { required = true } = {}) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null || value === '')) return ''
    throw new TypeError(`${label} must be text.`)
  }

  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (hasUnsupportedControlCharacters(normalized)) {
    throw new TypeError(`${label} contains unsupported control characters.`)
  }
  if (required && normalized.length === 0) {
    throw new TypeError(`${label} is required.`)
  }
  if (normalized.length > maxLength) {
    throw new TypeError(`${label} must be ${maxLength} characters or fewer.`)
  }
  return normalized
}

function validateDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${label} must use YYYY-MM-DD format.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${label} must be a valid calendar date.`)
  }
  return value
}

function validateDateTime(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be a valid date and time.`)
  }
  return value
}

export function validateDailyIcebreaker(value) {
  const prompt = requireObject(value, 'Daily icebreaker')
  return {
    id: requireId(prompt.id, 'Icebreaker id'),
    date: validateDate(prompt.date, 'Icebreaker date'),
    prompt: validatePlainText(prompt.prompt, 'Icebreaker prompt', 500),
  }
}

export function validateCuratedActivity(value) {
  const activity = requireObject(value, 'Curated activity')
  const result = {
    id: requireId(activity.id, 'Activity id'),
    title: validatePlainText(activity.title, 'Activity title', 100),
    description: validatePlainText(activity.description, 'Activity description', 500),
  }

  if (activity.durationMinutes !== undefined) {
    if (!Number.isInteger(activity.durationMinutes) || activity.durationMinutes < 1 || activity.durationMinutes > 600) {
      throw new TypeError('Activity duration must be between 1 and 600 minutes.')
    }
    result.durationMinutes = activity.durationMinutes
  }

  return result
}

export function validateCuratedActivities(value) {
  if (!Array.isArray(value)) throw new TypeError('Activities must be an array.')
  return value.map(validateCuratedActivity)
}

export function validateProposalDraft(value) {
  const draft = requireObject(value, 'Date proposal')
  const result = {
    activityId: requireId(draft.activityId, 'Activity id'),
    note: validatePlainText(draft.note ?? '', 'Proposal note', 500, { required: false }),
  }

  if (draft.proposedAt !== undefined && draft.proposedAt !== '') {
    result.proposedAt = validateDateTime(draft.proposedAt, 'Proposed time')
  }
  return result
}

export function validateProposalRecord(value) {
  const proposal = requireObject(value, 'Date proposal')
  if (!['pending', 'accepted', 'declined', 'cancelled'].includes(proposal.status)) {
    throw new TypeError('Proposal status is invalid.')
  }
  const result = {
    id: requireId(proposal.id, 'Proposal id'),
    activityId: requireId(proposal.activityId, 'Activity id'),
    status: proposal.status,
    note: validatePlainText(proposal.note ?? '', 'Proposal note', 500, { required: false }),
    permissions: {
      canRespond: proposal.permissions?.canRespond === true,
      canCancel: proposal.permissions?.canCancel === true,
    },
  }
  if (
    proposal.permissions !== undefined &&
    (!proposal.permissions || typeof proposal.permissions !== 'object' || Array.isArray(proposal.permissions) ||
      (proposal.permissions.canRespond !== undefined && typeof proposal.permissions.canRespond !== 'boolean') ||
      (proposal.permissions.canCancel !== undefined && typeof proposal.permissions.canCancel !== 'boolean'))
  ) {
    throw new TypeError('Proposal permissions must be explicit booleans.')
  }
  if (proposal.proposedAt !== undefined && proposal.proposedAt !== '') {
    result.proposedAt = validateDateTime(proposal.proposedAt, 'Proposed time')
  }
  return result
}

export function validateProposalRecords(value) {
  if (!Array.isArray(value)) throw new TypeError('Proposals must be an array.')
  return value.map(validateProposalRecord)
}

export function getVoiceCallAvailability(capability) {
  const unavailable = (reason) => ({ available: false, reason })
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    return unavailable('Call availability has not been confirmed by the service.')
  }
  if (
    capability.providerReady !== true ||
    capability.mediaConfigured !== true ||
    capability.entitled !== true ||
    capability.mutualConsent !== true ||
    typeof capability.providerId !== 'string' ||
    !PROVIDER_PATTERN.test(capability.providerId)
  ) {
    return unavailable('A vetted provider, entitlement, and mutual consent are required.')
  }
  return { available: true, providerId: capability.providerId }
}
