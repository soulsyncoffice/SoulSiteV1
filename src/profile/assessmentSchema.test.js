import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessmentDimensions,
  buildAssessmentSubmission,
  getActiveAssessmentQuestions,
  validateAssessmentResult,
} from './assessmentSchema.js'

const completeAnswers = {
  priority: 'care',
  'value-care': 'time-together',
  communication: 'thoughtful',
  pace: 'steady',
  boundaries: 'check-in',
}

function validResult(answers) {
  return {
    schemaVersion: 1,
    dimensions: assessmentDimensions.map((dimension, index) => ({
      ...dimension,
      score: index * 10,
      explanation: `Server explanation for ${dimension.label}.`,
      evidence: [Object.keys(answers)[index]],
    })),
    disclaimer: 'A reflection of submitted preferences, not a diagnosis or prediction.',
  }
}

test('adapts its follow-up prompt to the explicit values answer without scoring', () => {
  const careQuestions = getActiveAssessmentQuestions({ priority: 'care' })
  const explorationQuestions = getActiveAssessmentQuestions({ priority: 'exploration' })

  assert.ok(careQuestions.some(({ id }) => id === 'value-care'))
  assert.ok(!careQuestions.some(({ id }) => id === 'value-exploration'))
  assert.ok(explorationQuestions.some(({ id }) => id === 'value-exploration'))
})

test('requires explicit consent and every active answer before submission', () => {
  assert.throws(() => buildAssessmentSubmission(completeAnswers, false), /consent is required/u)
  assert.throws(
    () => buildAssessmentSubmission({ priority: 'care' }, true),
    /Complete the assessment questions/u,
  )
})

test('submits only validated answers and no client-calculated dimensions or scores', () => {
  const submission = buildAssessmentSubmission(
    { ...completeAnswers, score: 100, dimensions: [{ id: 'values', score: 100 }] },
    true,
  )

  assert.equal(submission.consented, true)
  assert.deepEqual(submission.answers, completeAnswers)
  assert.equal(Object.hasOwn(submission, 'score'), false)
  assert.equal(Object.hasOwn(submission, 'dimensions'), false)
})

test('accepts server explanations only for named dimensions and submitted evidence', () => {
  const submission = buildAssessmentSubmission(completeAnswers, true)
  const result = validateAssessmentResult(validResult(submission.answers), submission.answers)

  assert.equal(result.dimensions.length, assessmentDimensions.length)
  assert.match(result.dimensions[0].explanation, /Server explanation/u)
})

test('rejects missing dimensions, unsupported evidence, and invalid scores', () => {
  const submission = buildAssessmentSubmission(completeAnswers, true)
  const missingDimension = validResult(submission.answers)
  missingDimension.dimensions.pop()
  assert.throws(
    () => validateAssessmentResult(missingDimension, submission.answers),
    /every named dimension/u,
  )

  const unsupportedEvidence = validResult(submission.answers)
  unsupportedEvidence.dimensions[0].evidence = ['unsubmitted-answer']
  assert.throws(
    () => validateAssessmentResult(unsupportedEvidence, submission.answers),
    /invalid dimension explanation/u,
  )

  const invalidScore = validResult(submission.answers)
  invalidScore.dimensions[0].score = 101
  assert.throws(
    () => validateAssessmentResult(invalidScore, submission.answers),
    /invalid dimension explanation/u,
  )
})
