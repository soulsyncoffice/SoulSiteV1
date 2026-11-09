import { validatePlainText } from './contracts.js'

export function createIcebreakerState() {
  return { phase: 'answering', ownAnswer: '', ownSubmitted: false, partnerSubmitted: false }
}

export function icebreakerReducer(state, action) {
  if (!state || !action || typeof action.type !== 'string') {
    throw new TypeError('Icebreaker state and action are required.')
  }

  switch (action.type) {
    case 'SUBMIT': {
      if (state.phase !== 'answering') throw new RangeError('This icebreaker can no longer be answered.')
      const ownAnswer = validatePlainText(action.answer, 'Answer', 1000)
      return { ...state, ownAnswer, ownSubmitted: true, phase: state.partnerSubmitted ? 'revealed' : 'waiting' }
    }
    case 'PARTNER_SUBMITTED': {
      if (state.phase === 'skipped') throw new RangeError('A skipped icebreaker cannot be revealed.')
      return {
        ...state,
        partnerSubmitted: true,
        phase: state.ownSubmitted ? 'revealed' : 'answering',
      }
    }
    case 'SKIP':
      if (state.phase !== 'answering') throw new RangeError('Only an unanswered icebreaker can be skipped.')
      return { ...state, phase: 'skipped' }
    default:
      throw new TypeError(`Unknown icebreaker action: ${action.type}`)
  }
}

export function proposalReducer(status, action) {
  if (!['pending', 'accepted', 'declined', 'cancelled'].includes(status)) {
    throw new TypeError('Proposal status is invalid.')
  }
  if (status !== 'pending') throw new RangeError('Only a pending proposal can change.')
  if (!action || !['ACCEPT', 'DECLINE', 'CANCEL'].includes(action.type)) {
    throw new TypeError('Proposal action is invalid.')
  }

  return { ACCEPT: 'accepted', DECLINE: 'declined', CANCEL: 'cancelled' }[action.type]
}

export function getMutualActivityStatus(consent) {
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) {
    throw new TypeError('Activity consent must be an object.')
  }
  if (consent.cancelled !== undefined && typeof consent.cancelled !== 'boolean') {
    throw new TypeError('Activity cancellation state must be an explicit boolean.')
  }
  if (consent.cancelled === true) return 'cancelled'
  if (typeof consent.ownAccepted !== 'boolean' || typeof consent.partnerAccepted !== 'boolean') {
    throw new TypeError('Both participants’ consent states must be explicit booleans.')
  }
  if (consent.ownAccepted && consent.partnerAccepted) return 'active'
  if (consent.ownAccepted) return 'awaiting-partner'
  if (consent.partnerAccepted) return 'invited'
  return 'proposed'
}
