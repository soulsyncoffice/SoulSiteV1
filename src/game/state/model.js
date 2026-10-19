export {
  createInitialState,
  isComplete,
  markPlayerDisconnected,
  reconnectPlayer,
  restoreCheckpoint,
  serializeCheckpoint,
  simulateStep,
} from '../engine/engine.js';

export function getAccessibleControls(customBindings = {}) {
  return Object.freeze({
    ...{
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      a: 'left',
      s: 'down',
      d: 'right',
      Enter: 'interact',
      ' ': 'interact',
    },
    ...customBindings,
  });
}

export function createGameIntegration({ submitReward, syncState, loadCheckpoint }) {
  for (const [name, operation] of Object.entries({ submitReward, syncState, loadCheckpoint })) {
    if (typeof operation !== 'function') {
      throw new TypeError(`${name} must be provided by the authenticated server adapter`);
    }
  }
  return Object.freeze({
    submitReward,
    syncState,
    loadCheckpoint,
  });
}
