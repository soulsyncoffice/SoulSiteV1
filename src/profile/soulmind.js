import { overviewRequiredQuestions, profileSections } from './profileSchema.js'

const WORD_LIMIT = 500

function wordCount(text) {
  return (String(text).match(/\S+/gu) || []).length
}

function encodedAnswer(value) {
  return JSON.stringify(String(value))
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}

export function getMissingOverviewQuestions(answers = {}) {
  return overviewRequiredQuestions.filter(({ id }) => !String(answers[id] ?? '').trim())
}

export function countOverviewWords(text) {
  return wordCount(text)
}

export function generateOverview(answers = {}, includeInOverview = {}) {
  const missing = getMissingOverviewQuestions(answers)
  if (missing.length) {
    const labels = missing.map(({ label }) => label).join(', ')
    throw new Error(`Add an answer for: ${labels}.`)
  }

  const entries = profileSections.flatMap((section) =>
    section.fields
      .filter((field) =>
        field.overviewRequired || (includeInOverview[field.id] !== false && !section.sensitive),
      )
      .map((field) => ({
        id: field.id,
        label: field.label,
        answer: String(answers[field.id] ?? '').trim(),
      }))
      .filter((field) => field.answer),
  )

  const lines = entries.map(({ label, answer }) => `${label}: ${encodedAnswer(answer)}`)
  const heading = "SoulSite's Overview"
  const disclosure = [
    'Source note: This deterministic draft compiles only answers you chose to include. Each personal detail is attributed to its prompt and JSON-quoted as entered. No events, causes, traits, identity, diagnoses, or compatibility are inferred.',
    'Profile answers:',
    ...lines,
    'Repeated labelled word excerpts (repeated only to meet the fixed word count; they add no claims):',
  ].join('\n\n')
  const draft = `${heading}\n\n${disclosure}`
  const used = wordCount(draft)

  if (used > WORD_LIMIT) {
    throw new Error(
      `The selected answers use ${used} words before the 500-word limit. Shorten an answer or leave some optional answers out of the overview; no content was truncated.`,
    )
  }

  const sourceWords = entries.flatMap(({ label, answer }) =>
    answer
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `${label.replace(/\s+/gu, '-')}:${encodedAnswer(token)}`),
  )
  const repeatedWords = []
  let sourceIndex = 0
  while (used + repeatedWords.length < WORD_LIMIT) {
    repeatedWords.push(sourceWords[sourceIndex % sourceWords.length])
    sourceIndex += 1
  }

  return `${draft}\n\n${repeatedWords.join(' ')}`
}
