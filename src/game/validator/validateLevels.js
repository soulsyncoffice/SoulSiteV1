import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MECHANICS = new Set([
  'move', 'collect', 'checkpoint', 'interact', 'switches', 'locked-gate',
  'hazard-reset', 'co-op', 'simultaneous-plates', 'branching-route',
  'route-choice', 'safe-water-route', 'beacon-switches', 'ordered-route',
  'maze', 'detour', 'safe-route', 'relay-plates', 'shared-switches',
  'simultaneous-switches',
]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const OBJECTIVES = new Set([
  'reach-exit', 'collect-and-exit', 'activate-and-exit', 'cooperative-plates',
]);
const TILES = new Set('#.SR ECTG BHP'.replaceAll(' ', ''));
const TARGET_WORLDS = 10;
const LEVELS_PER_WORLD = 50;

function floodFill(layout, start) {
  const height = layout.length;
  const width = layout[0].length;
  const pending = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  while (pending.length) {
    const { x, y } = pending.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height ||
          layout[ny][nx] === '#' || visited.has(key)) continue;
      visited.add(key);
      pending.push({ x: nx, y: ny });
    }
  }
  return visited;
}

export function validateLevels(levels) {
  const errors = [];
  if (!Array.isArray(levels) || levels.length === 0) return ['Levels must be a non-empty array'];
  const ids = new Set();
  const worldNumbers = new Set();
  const layouts = new Set();
  const titles = new Set();

  levels.forEach((level, index) => {
    const label = level?.id || `level at index ${index}`;
    const requiredText = ['id', 'world', 'title', 'accessibilityNotes'];
    for (const field of requiredText) {
      if (typeof level?.[field] !== 'string' || level[field].trim().length < 3) {
        errors.push(`${label}: ${field} must be a non-empty string`);
      }
    }
    if (!level || typeof level !== 'object') return;
    if (ids.has(level.id)) errors.push(`${label}: duplicate id`);
    ids.add(level.id);
    if (!Number.isInteger(level.version) || level.version < 1) errors.push(`${label}: version must be a positive integer`);
    if (!Number.isInteger(level.number) || level.number < 1) errors.push(`${label}: number must be a positive integer`);
    if (!['solo', 'co-op'].includes(level.mode)) errors.push(`${label}: mode must be solo or co-op`);
    if (!DIFFICULTIES.has(level.difficulty)) errors.push(`${label}: unknown difficulty`);
    if (typeof level.world === 'string') {
      const worldNumber = `${level.world}:${level.number}`;
      if (worldNumbers.has(worldNumber)) errors.push(`${label}: duplicate level number in ${level.world}`);
      worldNumbers.add(worldNumber);
    }

    if (!Array.isArray(level.layout) || level.layout.length < 3 ||
        level.layout.some(row => typeof row !== 'string' || row.length !== level.layout[0].length)) {
      errors.push(`${label}: layout must be a rectangular array of strings`);
      return;
    }
    const layoutKey = level.layout.join('\n');
    if (layouts.has(layoutKey)) errors.push(`${label}: layout duplicates another authored level`);
    layouts.add(layoutKey);
    for (const row of level.layout) {
      for (const tile of row) if (!TILES.has(tile)) errors.push(`${label}: unsupported tile "${tile}"`);
    }
    const markerCount = marker => level.layout.join('').split(marker).length - 1;
    if (markerCount('S') !== 1) errors.push(`${label}: layout must contain exactly one start (S)`);
    if (markerCount('E') !== 1) errors.push(`${label}: layout must contain exactly one exit (E)`);
    if (markerCount('R') !== 1) errors.push(`${label}: layout must contain exactly one checkpoint (R)`);

    const objective = level.objective;
    if (!objective || !OBJECTIVES.has(objective.type)) {
      errors.push(`${label}: objective type is missing or unsupported`);
    } else if (objective.type === 'collect-and-exit') {
      if (!Number.isInteger(objective.requiredCollectibles) || objective.requiredCollectibles < 1 ||
          markerCount('C') < objective.requiredCollectibles) {
        errors.push(`${label}: collect objective requires enough collectible (C) tiles`);
      }
    } else if (objective.type === 'activate-and-exit') {
      if (!Number.isInteger(objective.requiredSwitches) || objective.requiredSwitches < 1 ||
          markerCount('T') < objective.requiredSwitches) {
        errors.push(`${label}: switch objective requires enough switch (T) tiles`);
      }
    } else if (objective.type === 'cooperative-plates') {
      if (level.mode !== 'co-op' || !Array.isArray(objective.plates) || objective.plates.length < 2 ||
          objective.plates.length > markerCount('P')) {
        errors.push(`${label}: cooperative objective requires co-op mode and at least two mapped plates`);
      }
      for (const plate of objective.plates ?? []) {
        if (!Number.isInteger(plate.x) || !Number.isInteger(plate.y) ||
            level.layout[plate.y]?.[plate.x] !== 'P') errors.push(`${label}: plate coordinates must point to a P tile`);
      }
    }
    if (level.mode === 'co-op' && objective?.type !== 'cooperative-plates') {
      errors.push(`${label}: co-op mode currently requires a cooperative-plates objective`);
    }

    if (!Array.isArray(level.mechanics) || level.mechanics.length < 2) {
      errors.push(`${label}: at least two mechanics must be listed`);
    } else {
      for (const mechanic of level.mechanics) {
        if (!MECHANICS.has(mechanic)) errors.push(`${label}: unknown mechanic "${mechanic}"`);
      }
    }
    if (!level.checkpoint || !Number.isInteger(level.checkpoint.x) ||
        !Number.isInteger(level.checkpoint.y) ||
        level.layout[level.checkpoint.y]?.[level.checkpoint.x] !== 'R' ||
        typeof level.checkpoint.description !== 'string' || level.checkpoint.description.trim().length < 8) {
      errors.push(`${label}: checkpoint must identify the R tile and describe it`);
    }
    const spawn = level.layout.flatMap((row, y) =>
      [...row].flatMap((tile, x) => tile === 'S' ? [{ x, y }] : []))[0];
    const reachable = spawn ? floodFill(level.layout, spawn) : new Set();
    for (const marker of ['E', 'R']) {
      const coords = level.layout.flatMap((row, y) =>
        [...row].flatMap((tile, x) => tile === marker ? [{ x, y }] : []))[0];
      if (coords && !reachable.has(`${coords.x},${coords.y}`)) errors.push(`${label}: ${marker} is not reachable from start`);
    }
    const requiredMarkers = objective?.type === 'collect-and-exit' ? ['C']
      : objective?.type === 'activate-and-exit' ? ['T']
        : objective?.type === 'cooperative-plates' ? ['P'] : [];
    for (const marker of requiredMarkers) {
      const reachableCount = level.layout.flatMap((row, y) =>
        [...row].flatMap((tile, x) =>
          tile === marker && reachable.has(`${x},${y}`) ? [{ x, y }] : [])).length;
      const needed = marker === 'C' ? objective.requiredCollectibles
        : marker === 'T' ? objective.requiredSwitches : objective.plates.length;
      if (reachableCount < needed) errors.push(`${label}: not enough ${marker} objective tiles are reachable`);
    }
    if (!level.mechanics?.includes('move')) errors.push(`${label}: movement mechanic must be listed`);
    const title = `${level.world}:${level.title}`.toLocaleLowerCase();
    if (titles.has(title)) errors.push(`${label}: duplicate title in world`);
    titles.add(title);
  });

  if (levels.length === TARGET_WORLDS * LEVELS_PER_WORLD) {
    const worlds = new Map();
    for (const level of levels) {
      if (!worlds.has(level.world)) worlds.set(level.world, new Set());
      worlds.get(level.world).add(level.number);
    }
    if (worlds.size !== TARGET_WORLDS) errors.push(`A 500-level release must contain exactly ${TARGET_WORLDS} worlds`);
    for (const [world, numbers] of worlds) {
      if (numbers.size !== LEVELS_PER_WORLD ||
          Array.from({ length: LEVELS_PER_WORLD }, (_, i) => i + 1).some(n => !numbers.has(n))) {
        errors.push(`${world}: expected levels numbered 1 through ${LEVELS_PER_WORLD}`);
      }
    }
  }
  return errors;
}

function main() {
  const levelsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../levels/levels.json');
  const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
  const errors = validateLevels(levels);
  if (errors.length) {
    console.error(`Validation failed (${errors.length} errors):\n${errors.map(error => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${levels.length} distinct authored levels across ${new Set(levels.map(level => level.world)).size} worlds.`);
  if (levels.length !== TARGET_WORLDS * LEVELS_PER_WORLD) {
    console.log(`Release target remains ${TARGET_WORLDS * LEVELS_PER_WORLD}; the current set is a partial catalog.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
