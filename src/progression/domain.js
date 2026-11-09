export const ICEBREAKER_PROMPTS = Object.freeze([
  { id: 'small-joy', prompt: 'What small thing reliably makes your day better?' },
  { id: 'ideal-hour', prompt: 'How would you spend one completely unplanned hour?' },
  { id: 'curiosity', prompt: 'What is something you would enjoy learning just for fun?' },
  { id: 'comfort-food', prompt: 'What meal feels like a little celebration to you?' },
  { id: 'good-day', prompt: 'What does a genuinely good ordinary day look like?' },
  { id: 'shared-place', prompt: 'What kind of place helps you feel most at ease?' },
])

export const ALIGNMENT_DIMENSIONS = Object.freeze([
  { id: 'conversationPace', label: 'Conversation pace' },
  { id: 'weekendRhythm', label: 'Weekend rhythm' },
  { id: 'planningStyle', label: 'Planning style' },
  { id: 'socialEnergy', label: 'Social energy' },
])

export const SAFETY_REPORT_CATEGORIES = Object.freeze([
  'harassment',
  'boundary-concern',
  'impersonation',
  'spam',
  'other-safety-concern',
])

const TEXT_LIMITS = Object.freeze({
  reflection: 2000,
  feedback: 1000,
  report: 500,
})

function requireCallback(callback, name) {
  if (typeof callback !== 'function') {
    throw new TypeError(`${name} must be provided by an authenticated application adapter.`)
  }
}

function validateDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new TypeError('day must be a date in YYYY-MM-DD format.')
  }
  const date = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== day) {
    throw new TypeError('day must be a valid calendar date.')
  }
  return day
}

function validateText(text, maxLength, { allowEmpty = false } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string.')
  const normalized = text.trim()
  if (!allowEmpty && normalized.length === 0) throw new TypeError('text cannot be empty.')
  if (normalized.length > maxLength) throw new RangeError(`text cannot exceed ${maxLength} characters.`)
  return normalized
}

async function approveText(text, moderateText) {
  if (!text) return ''
  requireCallback(moderateText, 'moderateText')
  const decision = await moderateText(text)
  if (!decision || decision.status !== 'approved') {
    throw new Error('Text was not approved by the moderation service.')
  }
  return text
}

export function chooseIcebreakerPrompt(seed, previousPromptIds = []) {
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer.')
  if (!Array.isArray(previousPromptIds) || previousPromptIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('previousPromptIds must be an array of prompt IDs.')
  }
  const available = ICEBREAKER_PROMPTS.filter(({ id }) => !previousPromptIds.includes(id))
  if (available.length === 0) return null
  const index = ((seed % available.length) + available.length) % available.length
  return available[index]
}

export async function savePrivateReflection({ day, text }, { moderateText, onSave }) {
  requireCallback(onSave, 'onSave')
  const entry = {
    day: validateDay(day),
    text: validateText(text, TEXT_LIMITS.reflection),
  }
  await approveText(entry.text, moderateText)
  return onSave(entry)
}

export async function retractPrivateReflection(day, onRetract) {
  requireCallback(onRetract, 'onRetract')
  return onRetract({ day: validateDay(day) })
}

export function transitionMutualProgression(state, action) {
  if (!state || !['inactive', 'pending', 'active', 'ended'].includes(state.status)
    || typeof state.selfConsent !== 'boolean'
    || typeof state.partnerConsent !== 'boolean') {
    throw new TypeError('state must contain a valid status and both consent flags.')
  }
  if (!action || !['request', 'retract', 'end'].includes(action.type)) {
    throw new TypeError('action type must be request, retract, or end.')
  }
  if (state.status === 'ended') throw new Error('Ended progression cannot be changed.')

  if (action.type === 'end') {
    return { status: 'ended', selfConsent: false, partnerConsent: false }
  }

  const selfConsent = action.type === 'request'
  const partnerConsent = state.partnerConsent
  const status = selfConsent && partnerConsent ? 'active'
    : selfConsent || partnerConsent ? 'pending'
      : 'inactive'
  return { status, selfConsent, partnerConsent }
}

export function hasMutualConsent(state) {
  return Boolean(state
    && state.status === 'active'
    && state.selfConsent === true
    && state.partnerConsent === true)
}

export function canAccessCooperativeEvent(event, consentState) {
  return Boolean(event
    && event.visibility === 'private'
    && typeof event.id === 'string'
    && Array.isArray(event.steps)
    && event.steps.length > 0
    && hasMutualConsent(consentState))
}

export function validateCooperativeEvent(event) {
  if (!event || typeof event.id !== 'string' || event.id.trim() === ''
    || event.visibility !== 'private'
    || !Array.isArray(event.steps) || event.steps.length < 1 || event.steps.length > 12
    || event.steps.some((step) => !step
      || typeof step.id !== 'string'
      || step.id.trim() === ''
      || typeof step.label !== 'string'
      || step.label.trim() === ''
      || step.label.length > 120)) {
    throw new TypeError('event must be a private event with 1–12 valid steps.')
  }
  const ids = event.steps.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) throw new TypeError('event step IDs must be unique.')
  return event
}

export function calculateExplainableAlignment(left, right) {
  for (const [name, values] of [['left', left], ['right', right]]) {
    if (!values || ALIGNMENT_DIMENSIONS.some(({ id }) => !Number.isInteger(values[id]) || values[id] < 1 || values[id] > 5)) {
      throw new TypeError(`${name} preferences must rate every dimension with an integer from 1 to 5.`)
    }
  }

  const dimensions = ALIGNMENT_DIMENSIONS.map(({ id, label }) => {
    const difference = Math.abs(left[id] - right[id])
    const similarity = Math.round(((4 - difference) / 4) * 100)
    return {
      id,
      label,
      difference,
      similarity,
      explanation: difference === 0
        ? 'Both selected the same preference.'
        : `Preferences differ by ${difference} point${difference === 1 ? '' : 's'} on a five-point scale.`,
    }
  })
  return {
    score: Math.round(dimensions.reduce((sum, dimension) => sum + dimension.similarity, 0) / dimensions.length),
    dimensions,
    disclaimer: 'A reflection on a few stated preferences—not a prediction, ranking, or measure of anyone’s worth.',
  }
}

export async function sendFeedback(text, { moderateText, onFeedback }) {
  requireCallback(onFeedback, 'onFeedback')
  const normalized = validateText(text, TEXT_LIMITS.feedback)
  await approveText(normalized, moderateText)
  return onFeedback({ text: normalized })
}

export async function sendSafetyReport({ category, details = '' }, { moderateText, onReport }) {
  requireCallback(onReport, 'onReport')
  if (!SAFETY_REPORT_CATEGORIES.includes(category)) {
    throw new TypeError('category must be a supported safety-report category.')
  }
  const normalizedDetails = validateText(details, TEXT_LIMITS.report, { allowEmpty: true })
  await approveText(normalizedDetails, moderateText)
  return onReport({ category, details: normalizedDetails })
}
