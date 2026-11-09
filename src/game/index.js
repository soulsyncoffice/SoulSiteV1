import levels from './levels/levels.json' with { type: 'json' };

export * from './engine/engine.js';
export * from './state/model.js';
export { levels };

export function getLevelById(id) {
  return levels.find(level => level.id === id) ?? null;
}
