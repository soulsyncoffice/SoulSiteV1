export const assessmentDimensions = [
  { id: 'values', label: 'Values lens' },
  { id: 'communication', label: 'Communication preferences' },
  { id: 'connection', label: 'Connection pace' },
  { id: 'boundaries', label: 'Personal boundaries' },
]

const priorityFollowups = {
  care: {
    id: 'value-care',
    dimension: 'values',
    prompt: 'Which expression of care feels most meaningful to you?',
    options: [
      { value: 'checking-in', label: 'Thoughtful check-ins' },
      { value: 'time-together', label: 'Unhurried time together' },
      { value: 'practical-help', label: 'Practical help' },
      { value: 'clear-words', label: 'Clear, kind words' },
    ],
  },
  clarity: {
    id: 'value-clarity',
    dimension: 'values',
    prompt: 'When do you most appreciate having clarity?',
    options: [
      { value: 'plans', label: 'When making plans' },
      { value: 'expectations', label: 'When setting expectations' },
      { value: 'decisions', label: 'When making decisions together' },
      { value: 'changes', label: 'When something changes' },
    ],
  },
  independence: {
    id: 'value-independence',
    dimension: 'values',
    prompt: 'What helps you keep a healthy sense of independence in a connection?',
    options: [
      { value: 'own-interests', label: 'Keeping my own interests' },
      { value: 'quiet-time', label: 'Having quiet time' },
      { value: 'clear-plans', label: 'Making plans explicitly' },
      { value: 'check-ins', label: 'Agreeing on check-ins' },
    ],
  },
  exploration: {
    id: 'value-exploration',
    dimension: 'values',
    prompt: 'What kind of new experience would you most enjoy sharing?',
    options: [
      { value: 'creative', label: 'A creative activity' },
      { value: 'outdoors', label: 'Time outdoors' },
      { value: 'conversation', label: 'A new subject to discuss' },
      { value: 'local', label: 'Exploring somewhere nearby' },
    ],
  },
}

const initialQuestion = {
  id: 'priority',
  dimension: 'values',
  prompt: 'Which value feels most central when you decide how to spend time with someone?',
  options: [
    { value: 'care', label: 'Care and consideration' },
    { value: 'clarity', label: 'Clarity and honesty' },
    { value: 'independence', label: 'Independence and room to grow' },
    { value: 'exploration', label: 'Curiosity and new experiences' },
  ],
}

const sharedQuestions = [
  {
    id: 'communication',
    dimension: 'communication',
    prompt: 'How do you prefer to begin a new conversation?',
    options: [
      { value: 'thoughtful', label: 'A thoughtful question' },
      { value: 'direct', label: 'A clear, direct message' },
      { value: 'playful', label: 'A light or playful opening' },
      { value: 'gradual', label: 'A little time to warm up' },
    ],
  },
  {
    id: 'pace',
    dimension: 'connection',
    prompt: 'When getting to know someone, what pace usually feels comfortable?',
    options: [
      { value: 'gradual', label: 'Taking time gradually' },
      { value: 'steady', label: 'A steady rhythm' },
      { value: 'spontaneous', label: 'Room for spontaneity' },
      { value: 'discussed', label: 'Talking about pace together' },
    ],
  },
  {
    id: 'boundaries',
    dimension: 'boundaries',
    prompt: 'Which approach to personal boundaries works best for you?',
    options: [
      { value: 'direct', label: 'State preferences directly' },
      { value: 'check-in', label: 'Check in as things change' },
      { value: 'time', label: 'Take time to decide' },
      { value: 'collaborative', label: 'Work out expectations together' },
    ],
  },
]

const allQuestions = [initialQuestion, ...Object.values(priorityFollowups), ...sharedQuestions]
const questionsById = new Map(allQuestions.map((question) => [question.id, question]))

export function getActiveAssessmentQuestions(answers = {}) {
  const active = [initialQuestion]
  const branch = priorityFollowups[answers.priority]
  if (branch) active.push(branch)
  active.push(...sharedQuestions)
  return active
}

function allowedAnswer(questionId, answer) {
  const question = questionsById.get(questionId)
  return question?.options.some(({ value }) => value === answer) || false
}

export function buildAssessmentSubmission(answers = {}, consented = false) {
  if (!consented) {
    throw new Error('Explicit assessment consent is required before submitting answers.')
  }

  const activeQuestions = getActiveAssessmentQuestions(answers)
  const submittedAnswers = {}
  const unanswered = []
  for (const question of activeQuestions) {
    const answer = answers[question.id]
    if (!allowedAnswer(question.id, answer)) unanswered.push(question.id)
    else submittedAnswers[question.id] = answer
  }
  if (unanswered.length) {
    throw new Error(`Complete the assessment questions: ${unanswered.join(', ')}.`)
  }

  return {
    schemaVersion: 1,
    consented: true,
    answers: submittedAnswers,
  }
}

export function validateAssessmentResult(result, submittedAnswers) {
  if (
    !result
    || typeof result !== 'object'
    || result.schemaVersion !== 1
    || !Array.isArray(result.dimensions)
  ) {
    throw new Error('The assessment service returned an invalid result.')
  }

  const seenDimensions = new Set()
  const dimensions = result.dimensions.map((dimension) => {
    if (
      !dimension
      || !assessmentDimensions.some(({ id }) => id === dimension.id)
      || seenDimensions.has(dimension.id)
      || typeof dimension.label !== 'string'
      || !dimension.label.trim()
      || typeof dimension.explanation !== 'string'
      || !dimension.explanation.trim()
      || !Array.isArray(dimension.evidence)
      || dimension.evidence.length === 0
      || dimension.evidence.some((answerId) => !Object.hasOwn(submittedAnswers, answerId))
      || (dimension.score !== null
        && (!Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > 100))
    ) {
      throw new Error('The assessment service returned an invalid dimension explanation.')
    }
    const knownDimension = assessmentDimensions.find(({ id }) => id === dimension.id)
    if (dimension.label !== knownDimension.label) {
      throw new Error('The assessment service returned an unknown dimension label.')
    }
    seenDimensions.add(dimension.id)
    return dimension
  })

  if (seenDimensions.size !== assessmentDimensions.length) {
    throw new Error('The assessment service did not explain every named dimension.')
  }
  if (typeof result.disclaimer !== 'string' || !result.disclaimer.trim()) {
    throw new Error('The assessment service did not provide its limitations.')
  }

  return { ...result, dimensions }
}
