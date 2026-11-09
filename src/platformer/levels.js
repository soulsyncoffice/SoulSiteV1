const WORLDS = [
  { name: 'Glass Orchard', sky: ['#140e2e', '#3a2a78', '#f0c1ff'], ground: '#6a58ea', leaf: '#8fd18a', accent: '#f4a2ff' },
  { name: 'Moonmarket', sky: ['#1a1020', '#6a3a28', '#ffb07a'], ground: '#c46a3a', leaf: '#ffd27a', accent: '#ff8b6a' },
  { name: 'Harbor Drift', sky: ['#071426', '#14556a', '#8cebe1'], ground: '#1d6e78', leaf: '#85f2e0', accent: '#7aa2ff' },
  { name: 'Lantern Quarter', sky: ['#140818', '#5a2468', '#ff8bd2'], ground: '#7a3d88', leaf: '#ffd1f0', accent: '#f2c14e' },
  { name: 'Northline', sky: ['#0c1024', '#2a3d78', '#d5e4ff'], ground: '#4d6294', leaf: '#e7eefc', accent: '#c5b9ff' },
]

const STAGE_NAMES = [
  'First Light', 'Low Branches', 'Orchard Gate', 'Glass Wind',
  'Stall Roofs', 'Lantern Alley', 'Night Market', 'Last Dumpling',
  'Ferry Slip', 'Tide Steps', 'Pier Lights', 'Open Water',
  'Bookstair', 'Gold Window', 'Quiet Court', 'High Lantern',
  'Cold Path', 'Stone Choir', 'North Gate', 'Last Beacon',
]

export const TILE = 32

function blank(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => '.'))
}

function bridgeLargeGaps(rows, ground) {
  let x = 0
  while (x < rows[0].length) {
    if (rows[ground][x] === '#') {
      x += 1
      continue
    }
    const start = x
    while (x < rows[0].length && rows[ground][x] !== '#') x += 1
    if (x - start > 2) {
      for (let stone = start + 1; stone < x - 1; stone += 2) fill(rows, stone, ground - 2, 1, '=')
    }
  }
}

function placeOnSolid(rows, ground, x, tile) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const column = x + attempt
    const here = rows[ground - 1]?.[column]
    if (rows[ground]?.[column] === '#' && here !== 'S' && here !== 'E' && here !== 'N') {
      rows[ground - 1][column] = tile
      return
    }
  }
}

function fill(rows, x, y, length, tile) {
  for (let i = 0; i < length; i += 1) {
    if (rows[y]?.[x + i] !== undefined) rows[y][x + i] = tile
  }
}

function standSpots(rows) {
  const spots = []
  for (let y = 0; y < rows.length - 1; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const below = rows[y + 1][x]
      const here = rows[y][x]
      if (here === '#' || here === 'H') continue
      if (below === '#' || below === '=' || below === '^') spots.push({ x, y })
    }
  }
  return spots
}

export function exitReachable(level) {
  const rows = level.rows.map((row) => [...row])
  const spots = standSpots(rows)
  const start = spots.find((spot) => rows[spot.y][spot.x] === 'S')
  const exit = spots.find((spot) => rows[spot.y][spot.x] === 'E')
  if (!start || !exit) return false
  const keys = spots.filter((spot) => rows[spot.y][spot.x] === 'K')
  const open = [start]
  const seen = new Set([`${start.x},${start.y}`])
  while (open.length) {
    const current = open.pop()
    for (const next of spots) {
      const key = `${next.x},${next.y}`
      if (seen.has(key)) continue
      const dx = next.x - current.x
      const dy = next.y - current.y
      const walk = dy === 0 && Math.abs(dx) === 1
      const runningJump = dy === 0 && Math.abs(dx) <= 4
      const jump = Math.abs(dx) <= 3 && dy <= 2 && dy >= -3 && Math.abs(dx) + Math.max(0, -dy) <= 5
      if (!walk && !runningJump && !jump) continue
      seen.add(key)
      open.push(next)
    }
  }
  const reached = (spot) => seen.has(`${spot.x},${spot.y}`)
  return reached(exit) && keys.every(reached)
}

function craft(index, name) {
  const world = WORLDS[Math.floor(index / 4)]
  const width = 48 + index * 2
  const height = 15
  const ground = 12
  const rows = blank(width, height)
  const maxGap = 1 + Math.floor(index / 7)
  let cursor = 0
  while (cursor < width - 4) {
    const length = Math.max(4, 8 - Math.floor(index / 8) + ((index + cursor) % 3))
    const use = Math.min(length, width - cursor)
    fill(rows, cursor, ground, use, '#')
    cursor += use
    if (cursor >= width - 6) break
    let gap = cursor < 10 ? 0 : 1 + ((index * 3 + cursor) % maxGap)
    if (cursor > width - 12) gap = 0
    if (gap >= 3) fill(rows, cursor + Math.floor(gap / 2), ground - 2, 2, '=')
    cursor += gap
  }
  fill(rows, width - 7, ground, 7, '#')
  bridgeLargeGaps(rows, ground)

  if (index % 4 === 2) {
    fill(rows, 16, ground, 8, '.')
    fill(rows, 16, ground - 2, 8, '#')
    fill(rows, 14, ground - 1, 2, '=')
  }
  if (index >= 4) {
    const shelf = 10 + (index % 6)
    fill(rows, shelf, ground - 4, 4, '=')
    if (rows[ground - 5][shelf + 1] === '.') rows[ground - 5][shelf + 1] = 'C'
  }
  if (index >= 11) fill(rows, 22, ground - 3, 3, '^')

  rows[ground - 1][3] = 'S'
  if (index === 0) rows[ground - 1][6] = 'N'
  rows[ground - 1][width - 3] = 'E'
  const checkpoint = Math.floor(width / 2)
  if (rows[ground - 1][checkpoint] === '.') rows[ground - 1][checkpoint] = 'R'

  for (let i = 0; i < 4 + Math.floor(index / 3); i += 1) {
    const x = 8 + ((i * 19 + index * 5) % (width - 14))
    if (rows[ground][x] === '#' && rows[ground - 1][x] === '.') rows[ground - 1][x] = 'C'
  }

  for (let i = 0; i < Math.min(7, Math.floor(index / 2)); i += 1) {
    const x = 12 + ((i * 23 + index * 3) % (width - 18))
    if (rows[ground][x] === '#' && rows[ground - 1][x] === '.') rows[ground - 1][x] = 'M'
  }

  if (index >= 6) {
    for (let i = 0; i < 1 + Math.floor((index - 6) / 4); i += 1) {
      const x = 14 + ((i * 29 + index) % (width - 20))
      if (rows[ground][x] === '#' && rows[ground - 1][x] === '.') rows[ground - 1][x] = 'H'
    }
  }

  const keysNeeded = index >= 8 ? 1 + (index >= 16 ? 1 : 0) : 0
  for (let i = 0; i < keysNeeded; i += 1) {
    placeOnSolid(rows, ground, 9 + i * 11, 'K')
  }

  const movers = index >= 10
    ? [{
      id: 'ferry',
      x: (18 + (index % 5)) * TILE,
      y: (ground - 3) * TILE,
      w: 96,
      h: 14,
      range: 64 + index * 2,
      speed: 0.7 + index * 0.03,
      phase: index,
    }]
    : []

  return {
    id: index + 1,
    name,
    world: world.name,
    palette: world,
    rows: rows.map((row) => row.join('')),
    keysNeeded,
    movers,
    enemySpeed: 34 + index * 6,
    enemyHp: index >= 15 ? 2 : 1,
    hint: index === 0
      ? 'Arrows run. Space or Up jumps. Down drops through thin platforms. F fires. I interacts.'
      : '',
  }
}

export const levels = STAGE_NAMES.map((name, index) => craft(index, name))

export function levelByNumber(number) {
  return levels[Math.max(0, Math.min(levels.length - 1, number - 1))]
}
