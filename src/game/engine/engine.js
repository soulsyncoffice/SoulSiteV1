export const ENGINE_VERSION = '1.0.0';

const DIRECTIONS = Object.freeze({
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
});

const KEY_ACTIONS = Object.freeze({
  ArrowUp: 'up',
  w: 'up',
  ArrowDown: 'down',
  s: 'down',
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
});

export function normalizeInput(input, customBindings = {}) {
  if (input === 'interact' || input === 'Enter' || input === ' ') {
    return { type: 'interact' };
  }
  const binding = customBindings[input] ?? KEY_ACTIONS[input];
  const direction = DIRECTIONS[input] ? input : binding;
  return direction ? { type: 'move', direction } : null;
}

export function createInitialState(level, playerCount = 1) {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) {
    throw new RangeError('playerCount must be an integer from 1 to 4');
  }
  if (level.mode === 'solo' && playerCount !== 1) {
    throw new RangeError('This level is solo-only');
  }
  if (level.mode === 'co-op' && playerCount < 2) {
    throw new RangeError('This level requires at least two players');
  }
  const spawn = findTile(level.layout, 'S');
  return {
    engineVersion: ENGINE_VERSION,
    levelId: level.id,
    levelVersion: level.version,
    tick: 0,
    status: 'playing',
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      x: spawn.x,
      y: spawn.y,
      connected: true,
    })),
    progress: {
      collected: [],
      activated: [],
      checkpoint: { x: spawn.x, y: spawn.y },
    },
  };
}

export function findTile(layout, marker) {
  for (let y = 0; y < layout.length; y += 1) {
    const x = layout[y].indexOf(marker);
    if (x !== -1) return { x, y };
  }
  throw new Error(`Level layout is missing tile "${marker}"`);
}

function tileAt(layout, x, y) {
  return layout[y]?.[x] ?? '#';
}

function isWalkable(tile, level, progress) {
  if (tile === '#') return false;
  if (tile === 'G') return progress.activated.length >= (level.objective.requiredSwitches ?? 0);
  if (tile === 'B') return progress.collected.length >= (level.objective.requiredCollectibles ?? 0);
  return true;
}

export function isComplete(level, state) {
  const objective = level.objective;
  if (state.status !== 'playing') return state.status === 'complete';
  if (objective.type === 'reach-exit') return state.players.some(p => tileAt(level.layout, p.x, p.y) === 'E');
  if (objective.type === 'collect-and-exit') {
    return state.progress.collected.length >= objective.requiredCollectibles &&
      state.players.some(p => tileAt(level.layout, p.x, p.y) === 'E');
  }
  if (objective.type === 'activate-and-exit') {
    return state.progress.activated.length >= objective.requiredSwitches &&
      state.players.some(p => tileAt(level.layout, p.x, p.y) === 'E');
  }
  if (objective.type === 'cooperative-plates') {
    const occupied = new Set();
    for (const player of state.players) {
      const plateIndex = objective.plates.findIndex(({ x, y }) => player.x === x && player.y === y);
      if (plateIndex !== -1) occupied.add(plateIndex);
    }
    return occupied.size === objective.plates.length;
  }
  throw new Error(`Unsupported objective type: ${objective.type}`);
}

export function simulateStep(level, state, inputs = [], bindings = {}) {
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  const orderedInputs = [...inputs].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));
  for (const { playerId, input } of orderedInputs) {
    const player = next.players.find(candidate => candidate.id === playerId);
    const action = normalizeInput(input, bindings);
    if (!player || !player.connected || !action) continue;

    if (action.type === 'move') {
      const [dx, dy] = DIRECTIONS[action.direction];
      const x = player.x + dx;
      const y = player.y + dy;
      if (isWalkable(tileAt(level.layout, x, y), level, next.progress)) {
        player.x = x;
        player.y = y;
        if (tileAt(level.layout, x, y) === 'R') next.progress.checkpoint = { x, y };
      }
      continue;
    }

    const tile = tileAt(level.layout, player.x, player.y);
    if (tile === 'C') next.progress.collected = [...new Set([...next.progress.collected, `${player.x},${player.y}`])];
    if (tile === 'T') next.progress.activated = [...new Set([...next.progress.activated, `${player.x},${player.y}`])];
    if (tile === 'H') {
      const checkpoint = next.progress.checkpoint;
      player.x = checkpoint.x;
      player.y = checkpoint.y;
    }
    if (tile === 'R') next.progress.checkpoint = { x: player.x, y: player.y };
  }

  next.tick += 1;
  if (isComplete(level, next)) next.status = 'complete';
  return next;
}

export function markPlayerDisconnected(state, playerId) {
  const next = structuredClone(state);
  const player = next.players.find(candidate => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  player.connected = false;
  return next;
}

export function reconnectPlayer(state, playerId) {
  const next = structuredClone(state);
  const player = next.players.find(candidate => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  player.connected = true;
  return next;
}

export function serializeCheckpoint(level, state) {
  if (state.levelId !== level.id || state.levelVersion !== level.version) {
    throw new Error('Checkpoint level identity does not match the active level');
  }
  return JSON.stringify({
    formatVersion: 1,
    engineVersion: ENGINE_VERSION,
    levelId: level.id,
    levelVersion: level.version,
    tick: state.tick,
    status: state.status,
    players: state.players,
    progress: state.progress,
  });
}

export function restoreCheckpoint(level, checkpoint) {
  const parsed = typeof checkpoint === 'string' ? JSON.parse(checkpoint) : checkpoint;
  if (parsed.formatVersion !== 1 || parsed.engineVersion !== ENGINE_VERSION) {
    throw new Error('Unsupported checkpoint format or engine version');
  }
  if (parsed.levelId !== level.id || parsed.levelVersion !== level.version) {
    throw new Error('Checkpoint belongs to a different level version');
  }
  if (!Array.isArray(parsed.players) || parsed.players.length < 1 || parsed.players.length > 4 ||
      !Number.isInteger(parsed.tick) || parsed.tick < 0 ||
      !['playing', 'complete'].includes(parsed.status) ||
      !parsed.progress || !Array.isArray(parsed.progress.collected) ||
      !Array.isArray(parsed.progress.activated) || !parsed.progress.checkpoint ||
      !Number.isInteger(parsed.progress.checkpoint.x) || !Number.isInteger(parsed.progress.checkpoint.y) ||
      parsed.players.some(player =>
        typeof player.id !== 'string' || !Number.isInteger(player.x) ||
        !Number.isInteger(player.y) || typeof player.connected !== 'boolean' ||
        tileAt(level.layout, player.x, player.y) === '#') ||
      parsed.players.some((player, index) =>
        parsed.players.slice(0, index).some(previous => previous.id === player.id)) ||
      parsed.progress.collected.some(position => typeof position !== 'string' ||
        !/^\d+,\d+$/.test(position)) ||
      parsed.progress.activated.some(position => typeof position !== 'string' ||
        !/^\d+,\d+$/.test(position))) {
    throw new TypeError('Checkpoint state is malformed');
  }
  if (tileAt(level.layout, parsed.progress.checkpoint.x, parsed.progress.checkpoint.y) === '#') {
    throw new TypeError('Checkpoint location is not walkable');
  }
  return structuredClone({
    engineVersion: parsed.engineVersion,
    levelId: parsed.levelId,
    levelVersion: parsed.levelVersion,
    tick: parsed.tick,
    status: parsed.status,
    players: parsed.players,
    progress: parsed.progress,
  });
}
