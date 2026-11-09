import assert from 'node:assert/strict'
import test from 'node:test'
import { generateOverview, countOverviewWords, getMissingOverviewQuestions } from './soulmind.js'

const completeAnswers = {
  selfDescription: 'I teach biology and enjoy quiet mornings.',
  interests: 'I collect maps and listen to jazz.',
  intentions: 'I am looking for a committed relationship.',
}

test('generates a titled overview with exactly 500 whitespace-delimited words', () => {
  const overview = generateOverview(completeAnswers)

  assert.equal(overview.split('\n')[0], "SoulSite's Overview")
  assert.equal(countOverviewWords(overview), 500)
})

test('returns neutral follow-up questions for missing required facts before generation', () => {
  const missing = getMissingOverviewQuestions({ selfDescription: 'A short profile.' })

  assert.deepEqual(missing.map(({ id }) => id), ['intentions', 'interests'])
  assert.match(missing[0].question, /\?$/u)
  assert.match(missing[1].question, /\?$/u)
  assert.throws(() => generateOverview({}), /Add an answer for:/u)
})

test('quotes hostile-looking input as data and does not emit executable markup', () => {
  const hostileAnswers = {
    ...completeAnswers,
    selfDescription: 'I wrote "</textarea><script>alert(1)</script>" as plain text.',
  }
  const overview = generateOverview(hostileAnswers)

  assert.ok(overview.includes('\\u003c/script\\u003e'))
  assert.ok(!overview.includes('<script>'))
  assert.ok(!overview.includes('</textarea>'))
  assert.equal(countOverviewWords(overview), 500)
})

test('adds no personal claims beyond the selected verbatim answers', () => {
  const overview = generateOverview(completeAnswers, {
    selfDescription: true,
    interests: true,
    intentions: true,
  })

  for (const answer of Object.values(completeAnswers)) {
    assert.ok(overview.includes(JSON.stringify(answer)))
  }
  assert.ok(overview.includes('No events, causes, traits, identity, diagnoses, or compatibility are inferred.'))
  assert.ok(!overview.includes('soulmate'))
  assert.ok(!overview.includes('perfect match'))
})

test('does not truncate answers when selected content exceeds the word limit', () => {
  const longAnswers = {
    selfDescription: `I share ${'carefully chosen personal details '.repeat(150)}`,
    interests: completeAnswers.interests,
    intentions: completeAnswers.intentions,
  }

  assert.throws(() => generateOverview(longAnswers), /no content was truncated/u)
})
