import assert from 'node:assert/strict'
import test from 'node:test'
import { hasContactInformation } from './contentPolicy.js'
import { validateProfilePayload } from './profileValidation.js'

test('contact policy catches normalized email, social handle, links, and phone numbers', () => {
  for (const text of [
    'Write to hello [at] example [dot] com',
    'Write to hello at example dot com',
    'Find me on Instagram: @violet.person',
    'Visit https://example.com/profile',
    'My personal site is example.com',
    'Call me at 415 555 0198',
    'my number is four one five five five five zero one nine eight',
  ]) {
    assert.equal(hasContactInformation(text), true, text)
  }
})

test('contact policy permits ordinary profile text', () => {
  assert.equal(hasContactInformation('I love Sunday hikes, live music, and thoughtful conversation.'), false)
})

test('profile validation trims text and defaults visibility to private at the API boundary', () => {
  const result = validateProfilePayload({
    profile: { displayName: '  River  ', values: 'Kindness and curiosity' },
    visibility: { displayName: 'matches' },
  })
  assert.deepEqual(result, {
    profile: { displayName: 'River', values: 'Kindness and curiosity' },
    visibility: { displayName: 'matches' },
    overview: null,
  })
})

test('profile validation rejects underage, unknown, oversized, and contact-bearing answers', () => {
  assert.match(validateProfilePayload({ profile: { age: '17' } }).error, /18 and over/)
  assert.match(validateProfilePayload({ profile: { unexpected: 'value' } }).error, /Unknown profile field/)
  assert.match(validateProfilePayload({ profile: { displayName: 'hello@example.com' } }).error, /contact details/)
  assert.match(validateProfilePayload({ profile: { displayName: 'x'.repeat(61) } }).error, /too long/)
})
