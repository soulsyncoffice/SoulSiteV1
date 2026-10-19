import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createInitialState,
  markPlayerDisconnected,
  normalizeInput,
  reconnectPlayer,
  restoreCheckpoint,
  serializeCheckpoint,
  simulateStep,
} from '../engine/engine.js';
import { validateLevels } from '../validator/validateLevels.js';
import { createGameIntegration } from '../state/model.js';

const levelsUrl = new URL('../levels/levels.json', import.meta.url);
const levels = JSON.parse(await readFile(fileURLToPath(levelsUrl), 'utf8'));
const level = id => levels.find(candidate => candidate.id === id);

function movePlayerTo(currentLevel, state, playerId, destination) {
  const start = state.players.find(player => player.id === playerId);
  const queue = [{ x: start.x, y: start.y, path: [] }];
  const visited = new Set([`${start.x},${start.y}`]);
  let path;
  while (queue.length) {
    const current = queue.shift();
    if (current.x === destination.x && current.y === destination.y) {
      path = current.path;
      break;
    }
    for (const [direction, dx, dy] of [
      ['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0],
    ]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const tile = currentLevel.layout[y]?.[x] ?? '#';
      const key = `${x},${y}`;
      if (tile === '#' || visited.has(key)) continue;
      visited.add(key);
      queue.push({ x, y, path: [...current.path, direction] });
    }
  }
  assert.ok(path, `No route to ${destination.x},${destination.y}`);
  return path.reduce((next, input) =>
    simulateStep(currentLevel, next, [{ playerId, input }]), state);
}

function positionsOf(currentLevel, tile) {
  return currentLevel.layout.flatMap((row, y) =>
    [...row].flatMap((value, x) => value === tile ? [{ x, y }] : []));
}

test('authored catalog validates and contains 20 distinct maps', () => {
  assert.equal(levels.length, 20);
  assert.deepEqual(validateLevels(levels), []);
  assert.equal(new Set(levels.map(item => item.layout.join('\n'))).size, 20);
  assert.equal(new Set(levels.map(item => item.world)).size, 10);
});

test('validator rejects an unreachable exit and an invalid mechanic', () => {
  const invalid = structuredClone([level('w01-01')]);
  invalid[0].layout[1] = '#S###C.#';
  invalid[0].mechanics.push('random-reskin');
  const errors = validateLevels(invalid);
  assert.ok(errors.some(error => error.includes('E is not reachable')));
  assert.ok(errors.some(error => error.includes('unknown mechanic')));
});

test('keyboard controls normalize consistently and unknown keys are ignored', () => {
  assert.deepEqual(normalizeInput('ArrowLeft'), { type: 'move', direction: 'left' });
  assert.deepEqual(normalizeInput('w'), { type: 'move', direction: 'up' });
  assert.deepEqual(normalizeInput('Enter'), { type: 'interact' });
  assert.equal(normalizeInput('q'), null);
  const currentLevel = level('w01-01');
  const custom = simulateStep(currentLevel, createInitialState(currentLevel), [
    { playerId: 'p1', input: 'i' },
  ], { i: 'down' });
  assert.equal(custom.players[0].y, 2);
});

test('movement is deterministic, turn-based, and does not mutate input state', () => {
  const currentLevel = level('w01-01');
  const state = createInitialState(currentLevel);
  const moved = simulateStep(currentLevel, state, [{ playerId: 'p1', input: 'right' }]);
  assert.deepEqual(state.players[0], { id: 'p1', x: 1, y: 1, connected: true });
  assert.deepEqual(moved.players[0], { id: 'p1', x: 2, y: 1, connected: true });
  assert.equal(moved.tick, 1);
  assert.deepEqual(
    simulateStep(currentLevel, state, [{ playerId: 'p1', input: 'right' }]),
    moved,
  );
});

test('checkpoint round-trip preserves level version and reconnect state', () => {
  const currentLevel = level('w01-01');
  const initial = createInitialState(currentLevel);
  const moved = simulateStep(currentLevel, initial, [{ playerId: 'p1', input: 'right' }]);
  const disconnected = markPlayerDisconnected(moved, 'p1');
  const restored = restoreCheckpoint(currentLevel, serializeCheckpoint(currentLevel, disconnected));
  assert.equal(restored.players[0].connected, false);
  assert.deepEqual(reconnectPlayer(restored, 'p1'), moved);
  assert.throws(
    () => restoreCheckpoint({ ...currentLevel, version: 2 }, serializeCheckpoint(currentLevel, moved)),
    /different level version/,
  );
});

test('co-op levels require two players and complete when both occupy their plates', () => {
  const currentLevel = level('w05-02');
  assert.throws(() => createInitialState(currentLevel), /at least two players/);
  const state = createInitialState(currentLevel, 2);
  const coLocated = {
    ...state,
    players: [
      { ...state.players[0], x: 4, y: 1 },
      { ...state.players[1], x: 4, y: 3 },
    ],
  };
  const onePlayerOnPlate = {
    ...state,
    players: [
      { ...state.players[0], x: 4, y: 1 },
      { ...state.players[1], x: 1, y: 3 },
    ],
  };
  assert.equal(simulateStep(currentLevel, onePlayerOnPlate).status, 'playing');
  const finished = simulateStep(currentLevel, coLocated);
  assert.equal(finished.status, 'complete');
  assert.equal(finished.tick, 1);
  assert.equal(simulateStep(currentLevel, finished), finished);
});

test('collect-and-exit and activate-and-exit objectives complete through real inputs', () => {
  const collectLevel = level('w01-01');
  let collectState = createInitialState(collectLevel);
  collectState = movePlayerTo(collectLevel, collectState, 'p1', positionsOf(collectLevel, 'C')[0]);
  collectState = simulateStep(collectLevel, collectState, [{ playerId: 'p1', input: 'interact' }]);
  collectState = movePlayerTo(collectLevel, collectState, 'p1', positionsOf(collectLevel, 'E')[0]);
  assert.equal(collectState.status, 'complete');
  assert.equal(collectState.progress.collected.length, 1);

  const switchLevel = level('w02-02');
  let switchState = createInitialState(switchLevel);
  for (const position of positionsOf(switchLevel, 'T')) {
    switchState = movePlayerTo(switchLevel, switchState, 'p1', position);
    switchState = simulateStep(switchLevel, switchState, [{ playerId: 'p1', input: 'interact' }]);
  }
  switchState = movePlayerTo(switchLevel, switchState, 'p1', positionsOf(switchLevel, 'E')[0]);
  assert.equal(switchState.status, 'complete');
  assert.equal(switchState.progress.activated.length, 2);
});

test('checkpoint updates when reached and integration requires injected authenticated adapters', () => {
  const currentLevel = level('w01-01');
  let state = createInitialState(currentLevel);
  state = movePlayerTo(currentLevel, state, 'p1', positionsOf(currentLevel, 'R')[0]);
  assert.deepEqual(state.progress.checkpoint, positionsOf(currentLevel, 'R')[0]);
  assert.throws(() => createGameIntegration({}), /submitReward must be provided/);
  const calls = [];
  const integration = createGameIntegration({
    submitReward: (...args) => calls.push(['reward', ...args]),
    syncState: (...args) => calls.push(['sync', ...args]),
    loadCheckpoint: (...args) => calls.push(['load', ...args]),
  });
  integration.submitReward('completion');
  assert.deepEqual(calls, [['reward', 'completion']]);
});

test('checkpoint restore rejects malformed state', () => {
  const currentLevel = level('w01-01');
  const serialized = JSON.parse(serializeCheckpoint(currentLevel, createInitialState(currentLevel)));
  serialized.tick = -1;
  assert.throws(() => restoreCheckpoint(currentLevel, serialized), /malformed/);
});
