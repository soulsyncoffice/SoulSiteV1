import assert from 'node:assert/strict'
import test from 'node:test'
import { controlMap, createRun, stepRun } from './engine.js'
import { exitReachable, levels } from './levels.js'

test('field run has 20 reachable stages that get wider', () => {
  assert.equal(levels.length, 20)
  assert.equal(new Set(levels.map((level) => level.rows.join('\n'))).size, 20)
  assert.equal(new Set(levels.map((level) => level.world)).size, 5)
  for (const level of levels) assert.equal(exitReachable(level), true, level.name)
  assert.ok(levels[19].rows[0].length > levels[0].rows[0].length)
  assert.ok(levels[19].enemySpeed > levels[0].enemySpeed)
})

test('arrows, space, F, and I map to the lead runner', () => {
  assert.equal(controlMap('ArrowLeft').action, 'left')
  assert.equal(controlMap('ArrowRight').action, 'right')
  assert.equal(controlMap('ArrowUp').action, 'jump')
  assert.equal(controlMap('ArrowDown').action, 'down')
  assert.equal(controlMap(' ').action, 'jump')
  assert.equal(controlMap('f').action, 'fire')
  assert.equal(controlMap('I').action, 'interact')
  assert.equal(controlMap('a').id, 'p2')
})

test('space jumps and F fires', () => {
  const run = createRun(levels[0], 1)
  const before = run.players[0].y
  stepRun(run, 1 / 60, { p1: { jump: true } })
  assert.ok(run.players[0].vy < 0)
  assert.ok(run.players[0].y <= before)
  stepRun(run, 1 / 60, { p1: { fire: true } })
  assert.equal(run.projectiles.length, 1)
})

test('I reads the opening note', () => {
  const run = createRun(levels[0], 1)
  run.players[0].x = 6 * 32
  stepRun(run, 1 / 60, { p1: { interact: true } })
  assert.match(run.message, /note says/i)
})
