import { profileFields, profileVisibilityOptions } from '../shared-types/profileFields.js'
import { hasContactInformation } from './contentPolicy.js'

const fieldByKey = new Map(profileFields.map((field) => [field.key, field]))

export function validateProfilePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'A profile object is required.' }
  }

  const { profile, visibility } = payload
  const overview = payload.overview ?? null
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { error: 'A profile object is required.' }
  }
  if (visibility !== undefined && (!visibility || typeof visibility !== 'object' || Array.isArray(visibility))) {
    return { error: 'Visibility settings must be an object.' }
  }
  if (overview !== null && typeof overview !== 'string') {
    return { error: 'The generated overview must be text.' }
  }
  if (overview && (overview.length > 6000 || hasContactInformation(overview))) {
    return { error: 'The generated overview is too long or contains contact details.' }
  }

  const normalizedProfile = {}
  for (const [key, value] of Object.entries(profile)) {
    const field = fieldByKey.get(key)
    if (!field) return { error: `Unknown profile field: ${key}.` }
    if (typeof value !== 'string') return { error: `${field.label} must be text.` }

    const text = value.trim()
    if (text.length > field.maxLength) return { error: `${field.label} is too long.` }
    if (hasContactInformation(text)) {
      return { error: `${field.label} cannot contain contact details, social handles, or external links.` }
    }
    if (key === 'age' && text && (!/^\d{1,3}$/.test(text) || Number(text) < 18 || Number(text) > 120)) {
      return { error: 'SoulSite is for adults 18 and over. Enter an age between 18 and 120.' }
    }
    if (text) normalizedProfile[key] = text
  }

  const normalizedVisibility = {}
  for (const [key, value] of Object.entries(visibility || {})) {
    if (!fieldByKey.has(key)) return { error: `Unknown profile visibility field: ${key}.` }
    if (!profileVisibilityOptions.includes(value)) {
      return { error: `Visibility for ${key} must be private, matches, or mutual_consent.` }
    }
    normalizedVisibility[key] = value
  }

  return { profile: normalizedProfile, visibility: normalizedVisibility, overview }
}
