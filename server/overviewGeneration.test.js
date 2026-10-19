import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOverviewRequest, parseOverviewResponse } from './overviewGeneration.js'

test('overview prompt requires user-specific facts and asks instead of padding', () => {
  const request = buildOverviewRequest({ values: 'Kindness and curiosity' })
  assert.match(request[0].content, /Do not invent/)
  assert.match(request[0].content, /Do not add generic filler/)
  assert.deepEqual(JSON.parse(request[1].content), {
    profileAnswers: { values: 'Kindness and curiosity' },
  })
})

test('overview response requires exactly 500 generated words', () => {
  const overview = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ')
  assert.equal(parseOverviewResponse(JSON.stringify({
    status: 'ready',
    sections: [{ text: overview, sourceFields: ['values'] }],
    question: '',
  }), { values: 'Kindness and curiosity' }).overview, overview)
  assert.throws(() => parseOverviewResponse(JSON.stringify({
    status: 'ready',
    sections: [{ text: 'This is a short response.', sourceFields: ['values'] }],
  }), { values: 'Kindness and curiosity' }), /exactly 500 words/)
  assert.throws(() => parseOverviewResponse(JSON.stringify({
    status: 'ready',
    sections: [{ text: overview, sourceFields: ['missing'] }],
  }), { values: 'Kindness and curiosity' }), /valid source/)
})

test('overview response can request a specific follow-up instead of fabricating', () => {
  assert.deepEqual(parseOverviewResponse(JSON.stringify({
    status: 'needs_more_information',
    overview: '',
    question: 'What kind of relationship are you looking for?',
  }), {}), {
    status: 'needs_more_information',
    question: 'What kind of relationship are you looking for?',
  })
})
