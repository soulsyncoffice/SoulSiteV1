import { TILE } from './levels.js'

const GRAVITY = 1560
const RUN = 228
const JUMP = -548
const ACCEL = 1680

export function createRun(level, playerCount = 1) {
  const tiles = level.rows.map((row) => [...row])
  const enemies = []
  let spawn = { x: 2, y: 2 }
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === 'S') spawn = { x, y }
      if (tiles[y][x] === 'M') {
        enemies.push({
          id: `e-${x}-${y}`,
          x: x * TILE + 6,
          y: y * TILE + 2,
          w: 20,
          h: 26,
          vx: level.enemySpeed * (x % 2 === 0 ? 1 : -1),
          hp: level.enemyHp,
          maxHp: level.enemyHp,
        })
        tiles[y][x] = '.'
      }
    }
  }
  const players = []
  for (let i = 0; i < playerCount; i += 1) {
    const player = makePlayer(i === 0 ? 'p1' : 'p2', spawn.x * TILE + 4 + i * 22, (spawn.y + 1) * TILE - 30)
    player.onGround = true
    player.coyote = 0.09
    players.push(player)
  }
  return {
    level,
    tiles,
    players,
    enemies,
    movers: (level.movers || []).map((mover) => ({ ...mover, origin: mover.x, carried: 0 })),
    projectiles: [],
    particles: [],
    keysHeld: 0,
    sparks: 0,
    status: 'play',
    message: level.hint || `${level.world} · ${level.name}`,
    messageTime: 3.2,
    elapsed: 0,
    shake: 0,
    checkpoint: { x: spawn.x * TILE + 4, y: (spawn.y + 1) * TILE - 30 },
  }
}

function makePlayer(id, x, y) {
  return {
    id,
    x,
    y,
    w: 18,
    h: 30,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    coyote: 0,
    jumpHeld: false,
    fireCooldown: 0,
    interactLatch: false,
    invuln: 0,
    hearts: 4,
    exited: false,
    drop: 0,
    floorVx: 0,
    anim: 0,
  }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function hitsSolid(tiles, box) {
  const x0 = Math.floor(box.x / TILE)
  const x1 = Math.floor((box.x + box.w - 0.01) / TILE)
  const y0 = Math.floor(box.y / TILE)
  const y1 = Math.floor((box.y + box.h - 0.01) / TILE)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (tiles[y]?.[x] === '#') return true
    }
  }
  return false
}

function separate(tiles, body, axis, velocity) {
  if (!hitsSolid(tiles, body)) return false
  const direction = Math.sign(velocity) || 1
  let guard = 0
  while (hitsSolid(tiles, body) && guard < 64) {
    body[axis] -= direction
    guard += 1
  }
  return true
}

function landOnOneWay(tiles, player) {
  if (player.vy < 0 || player.drop > 0) return false
  const foot = player.y + player.h
  const row = Math.floor(foot / TILE)
  const left = Math.floor((player.x + 2) / TILE)
  const right = Math.floor((player.x + player.w - 3) / TILE)
  const previousFoot = foot - Math.max(player.vy, 0) * 0.02 - 1
  if (previousFoot > row * TILE + 6) return false
  for (let x = left; x <= right; x += 1) {
    const tile = tiles[row]?.[x]
    if (tile === '=' || tile === '^') {
      player.y = row * TILE - player.h
      player.vy = tile === '^' ? -760 : 0
      player.onGround = true
      return true
    }
  }
  return false
}

function standOnMovers(state, player) {
  if (player.vy < 0 || player.drop > 0) return false
  for (const mover of state.movers) {
    const feet = player.y + player.h
    const onTop = player.x + player.w > mover.x + 4
      && player.x < mover.x + mover.w - 4
      && feet >= mover.y - 2
      && feet <= mover.y + 12
    if (!onTop) continue
    player.y = mover.y - player.h
    player.vy = 0
    player.onGround = true
    player.floorVx = mover.carried
    return true
  }
  return false
}

function burst(state, x, y, color, count = 8) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: Math.sin(i * 1.3) * 90,
      vy: -30 - (i % 5) * 22,
      life: 0.45,
      color,
    })
  }
  if (state.particles.length > 90) state.particles.splice(0, state.particles.length - 90)
}

function hurt(state, player) {
  if (player.invuln > 0 || state.status !== 'play') return
  player.hearts -= 1
  player.invuln = 1.05
  player.vx = -player.facing * 180
  player.vy = -260
  state.shake = 0.25
  if (player.hearts <= 0) {
    player.hearts = 4
    player.x = state.checkpoint.x
    player.y = state.checkpoint.y
    player.vx = 0
    player.vy = 0
    state.message = 'The field caught you. Try the jump again.'
    state.messageTime = 1.8
  }
}

function collectTile(state, player) {
  const tiles = state.tiles
  const points = [
    [player.x + 4, player.y + 8],
    [player.x + player.w - 4, player.y + 8],
    [player.x + player.w / 2, player.y + player.h - 2],
  ]
  for (const [px, py] of points) {
    const x = Math.floor(px / TILE)
    const y = Math.floor(py / TILE)
    const tile = tiles[y]?.[x]
    if (tile === 'C') {
      tiles[y][x] = '.'
      state.sparks += 1
      burst(state, x * TILE + 16, y * TILE + 16, '#fff1a8', 6)
    } else if (tile === 'K') {
      tiles[y][x] = '.'
      state.keysHeld += 1
      state.message = state.keysHeld >= state.level.keysNeeded ? 'The exit lantern is open.' : 'A key for the lantern.'
      state.messageTime = 1.6
      burst(state, x * TILE + 16, y * TILE + 16, '#f2c14e', 10)
    } else if (tile === 'R') {
      state.checkpoint = { x: x * TILE + 4, y: (y + 1) * TILE - 30 }
    } else if (tile === 'H') {
      hurt(state, player)
    } else if (tile === 'E' && state.keysHeld >= state.level.keysNeeded) {
      player.exited = true
    } else if (tile === 'E') {
      state.message = 'The exit lantern still wants a key.'
      state.messageTime = 1.2
    }
  }
}

function nearbyTile(tiles, player, wanted) {
  const cx = Math.floor((player.x + player.w / 2) / TILE)
  const cy = Math.floor((player.y + player.h / 2) / TILE)
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      if (tiles[y]?.[x] === wanted) return { x, y }
    }
  }
  return null
}

export function stepRun(state, dt, input) {
  const frame = Math.min(0.033, Math.max(0, dt))
  if (state.status !== 'play') return state
  state.elapsed += frame
  state.shake = Math.max(0, state.shake - frame)
  state.messageTime = Math.max(0, state.messageTime - frame)

  for (const mover of state.movers) {
    const previous = mover.x
    mover.x = mover.origin + Math.sin(state.elapsed * mover.speed + mover.phase) * mover.range
    mover.carried = (mover.x - previous) / Math.max(frame, 0.001)
  }

  for (const player of state.players) {
    const controls = input[player.id] || {}
    const wish = (controls.right ? 1 : 0) - (controls.left ? 1 : 0)
    if (wish !== 0) player.facing = wish
    const target = wish * RUN + (player.onGround ? player.floorVx : 0)
    player.vx += (target - player.vx) * Math.min(1, (ACCEL * frame) / RUN)
    if (wish === 0 && player.onGround) player.vx *= Math.max(0, 1 - 8 * frame)
    player.drop = controls.down ? 0.16 : Math.max(0, player.drop - frame)
    player.coyote = player.onGround ? 0.09 : Math.max(0, player.coyote - frame)
    if (controls.jump && !player.jumpHeld && (player.onGround || player.coyote > 0)) {
      player.vy = JUMP
      player.onGround = false
      player.coyote = 0
      burst(state, player.x + 8, player.y + player.h, '#ffffff', 4)
    }
    if (!controls.jump && player.vy < -180) player.vy = -180
    player.jumpHeld = Boolean(controls.jump)
    player.vy = Math.min(720, player.vy + GRAVITY * frame)
    player.fireCooldown = Math.max(0, player.fireCooldown - frame)
    player.invuln = Math.max(0, player.invuln - frame)
    player.anim += frame * (Math.abs(player.vx) > 20 ? 12 : 3)

    player.floorVx = 0
    player.onGround = false
    player.x += player.vx * frame
    if (separate(state.tiles, player, 'x', player.vx)) player.vx = 0
    player.y += player.vy * frame
    if (separate(state.tiles, player, 'y', player.vy)) {
      if (player.vy > 0) player.onGround = true
      player.vy = 0
    }
    if (landOnOneWay(state.tiles, player) || standOnMovers(state, player)) player.coyote = 0.09
    if (player.y > state.tiles.length * TILE + 80) hurt(state, player)
    collectTile(state, player)

    if (controls.fire && player.fireCooldown <= 0) {
      player.fireCooldown = 0.28
      state.projectiles.push({
        x: player.x + (player.facing > 0 ? player.w : -8),
        y: player.y + 10,
        w: 10,
        h: 6,
        vx: player.facing * 430,
        life: 0.7,
        owner: player.id,
      })
    }
    if (controls.interact && !player.interactLatch) {
      const sign = nearbyTile(state.tiles, player, 'N')
      const exit = nearbyTile(state.tiles, player, 'E')
      if (sign) {
        state.message = 'The note says: keep your feet under you, and fire only at the shadows.'
        state.messageTime = 2.4
      } else if (exit && state.keysHeld >= state.level.keysNeeded) {
        player.exited = true
      } else if (exit) {
        state.message = 'Interact again once you are holding the lantern key.'
        state.messageTime = 1.6
      } else {
        state.message = 'Nothing here answers.'
        state.messageTime = 0.8
      }
    }
    player.interactLatch = Boolean(controls.interact)
  }

  state.projectiles = state.projectiles.filter((shot) => {
    shot.x += shot.vx * frame
    shot.life -= frame
    if (shot.life <= 0 || hitsSolid(state.tiles, shot)) return false
    const hit = state.enemies.find((enemy) => overlaps(shot, enemy))
    if (!hit) return true
    hit.hp -= 1
    burst(state, hit.x + 8, hit.y + 8, '#f4a2ff', 8)
    return false
  })
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0)

  for (const enemy of state.enemies) {
    enemy.x += enemy.vx * frame
    const ahead = enemy.vx > 0 ? enemy.x + enemy.w + 2 : enemy.x - 2
    const foot = enemy.y + enemy.h + 4
    const wall = hitsSolid(state.tiles, enemy)
    const tileBelow = state.tiles[Math.floor(foot / TILE)]?.[Math.floor(ahead / TILE)]
    const ledge = tileBelow !== '#' && tileBelow !== '=' && tileBelow !== '^'
    if (wall || ledge) enemy.vx *= -1
    for (const player of state.players) {
      if (overlaps(player, enemy)) hurt(state, player)
    }
  }

  state.particles = state.particles.filter((spark) => {
    spark.life -= frame
    spark.x += spark.vx * frame
    spark.y += spark.vy * frame
    return spark.life > 0
  })

  if (state.players.every((player) => player.exited)) {
    state.status = 'clear'
    state.message = 'Level clear.'
    state.messageTime = 4
  }
  return state
}

export function controlMap(key, code) {
  const name = key.length === 1 ? key.toLowerCase() : key
  const p1 = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    ArrowDown: 'down',
    ' ': 'jump',
    f: 'fire',
    i: 'interact',
  }
  const p2 = {
    a: 'left',
    d: 'right',
    w: 'jump',
    s: 'down',
    g: 'fire',
    u: 'interact',
  }
  if (p1[key] || p1[name]) return { id: 'p1', action: p1[key] || p1[name] }
  if (p2[name]) return { id: 'p2', action: p2[name] }
  if (code === 'ShiftRight') return { id: 'p2', action: 'jump' }
  return null
}
