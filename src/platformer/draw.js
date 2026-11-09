import { TILE } from './levels.js'

export function drawRun(ctx, state, width, height) {
  const palette = state.level.palette
  const camera = frameCamera(state, width, height)
  ctx.clearRect(0, 0, width, height)
  const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 70) * 6 : 0
  drawSky(ctx, width, height, palette, camera)
  ctx.save()
  ctx.translate(shakeX, 0)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)
  drawHills(ctx, state, camera, palette)
  drawTiles(ctx, state, camera, palette)
  for (const mover of state.movers) drawMover(ctx, mover, palette)
  for (const enemy of state.enemies) drawEnemy(ctx, enemy, state.elapsed)
  for (const shot of state.projectiles) drawShot(ctx, shot)
  for (const player of state.players) drawPlayer(ctx, player, state.elapsed, palette)
  for (const spark of state.particles) {
    ctx.globalAlpha = Math.max(0, spark.life * 2)
    ctx.fillStyle = spark.color
    ctx.fillRect(spark.x, spark.y, 3, 3)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  drawHud(ctx, state, width, height)
}

function frameCamera(state, width, height) {
  const xs = state.players.map((player) => player.x + player.w / 2)
  const ys = state.players.map((player) => player.y + 8)
  const span = Math.max(...xs) - Math.min(...xs)
  const zoom = state.players.length > 1 ? Math.max(0.68, Math.min(1, 680 / (span + 260))) : 1
  const viewW = width / zoom
  const viewH = height / zoom
  const worldW = state.tiles[0].length * TILE
  const worldH = state.tiles.length * TILE
  let x = xs.reduce((sum, value) => sum + value, 0) / xs.length - viewW * 0.42
  let y = ys.reduce((sum, value) => sum + value, 0) / ys.length - viewH * 0.62
  x = Math.max(0, Math.min(worldW - viewW, x))
  y = Math.max(-40, Math.min(worldH - viewH + 20, y))
  return { x, y, zoom, viewW, viewH }
}

function drawSky(ctx, width, height, palette, camera) {
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, palette.sky[0])
  sky.addColorStop(0.55, palette.sky[1])
  sky.addColorStop(1, palette.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.globalAlpha = 0.7
  for (let i = 0; i < 28; i += 1) {
    const x = ((i * 137) - camera.x * 0.15) % (width + 40)
    const y = (i * 53) % (height * 0.55)
    ctx.fillStyle = i % 4 === 0 ? '#fff' : palette.accent
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1)
  }
  ctx.restore()
}

function drawHills(ctx, state, camera, palette) {
  const worldW = state.tiles[0].length * TILE
  ctx.fillStyle = palette.sky[1]
  ctx.globalAlpha = 0.35
  wave(ctx, camera.x * 0.35, camera.y + 180, worldW, 70, 46)
  ctx.fillStyle = palette.leaf
  ctx.globalAlpha = 0.18
  wave(ctx, camera.x * 0.55, camera.y + 250, worldW, 46, 28)
  ctx.globalAlpha = 1
}

function wave(ctx, shift, baseline, width, amplitude, step) {
  ctx.beginPath()
  ctx.moveTo(-200, baseline + 400)
  for (let x = -200; x < width + 200; x += step) {
    ctx.lineTo(x - shift, baseline + Math.sin(x * 0.01) * amplitude)
  }
  ctx.lineTo(width + 200, baseline + 400)
  ctx.fill()
}

function drawTiles(ctx, state, camera, palette) {
  const x0 = Math.max(0, Math.floor(camera.x / TILE) - 1)
  const x1 = Math.min(state.tiles[0].length, Math.ceil((camera.x + camera.viewW) / TILE) + 1)
  const y0 = Math.max(0, Math.floor(camera.y / TILE) - 1)
  const y1 = Math.min(state.tiles.length, Math.ceil((camera.y + camera.viewH) / TILE) + 1)
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const tile = state.tiles[y][x]
      if (tile === '.' || tile === 'M') continue
      const px = x * TILE
      const py = y * TILE
      if (tile === '#') {
        ctx.fillStyle = palette.ground
        ctx.fillRect(px, py, TILE, TILE)
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(px, py, TILE, 4)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(px, py + TILE - 4, TILE, 4)
        if ((x + y) % 3 === 0) {
          ctx.fillStyle = palette.leaf
          ctx.fillRect(px + 6, py - 4, 8, 6)
        }
      } else if (tile === '=' || tile === '^') {
        ctx.fillStyle = palette.accent
        ctx.fillRect(px, py + 18, TILE, 8)
        if (tile === '^') {
          ctx.beginPath()
          ctx.moveTo(px + 6, py + 18)
          ctx.lineTo(px + 16, py + 4)
          ctx.lineTo(px + 26, py + 18)
          ctx.fill()
        }
      } else if (tile === 'C') {
        ctx.fillStyle = '#fff1a8'
        ctx.beginPath()
        ctx.arc(px + 16, py + 16, 5, 0, Math.PI * 2)
        ctx.fill()
      } else if (tile === 'K') {
        ctx.strokeStyle = '#f2c14e'
        ctx.lineWidth = 2
        ctx.strokeRect(px + 10, py + 12, 12, 8)
        ctx.beginPath()
        ctx.arc(px + 16, py + 10, 4, 0, Math.PI * 2)
        ctx.stroke()
      } else if (tile === 'H') {
        ctx.fillStyle = '#ff6d8a'
        for (let spike = 0; spike < 3; spike += 1) {
          ctx.beginPath()
          ctx.moveTo(px + 4 + spike * 9, py + 28)
          ctx.lineTo(px + 8 + spike * 9, py + 10)
          ctx.lineTo(px + 12 + spike * 9, py + 28)
          ctx.fill()
        }
      } else if (tile === 'E') {
        const open = state.keysHeld >= state.level.keysNeeded
        ctx.fillStyle = open ? '#fff6c8' : '#6d6788'
        ctx.fillRect(px + 14, py + 8, 4, 22)
        ctx.beginPath()
        ctx.arc(px + 16, py + 8, open ? 8 : 5, 0, Math.PI * 2)
        ctx.fill()
      } else if (tile === 'N') {
        ctx.fillStyle = '#f7f4ff'
        ctx.fillRect(px + 8, py + 6, 16, 18)
        ctx.fillStyle = palette.accent
        ctx.fillRect(px + 11, py + 10, 10, 2)
        ctx.fillRect(px + 11, py + 15, 8, 2)
      } else if (tile === 'R') {
        ctx.fillStyle = palette.accent
        ctx.globalAlpha = 0.8
        ctx.fillRect(px + 14, py + 8, 4, 22)
        ctx.globalAlpha = 1
      }
    }
  }
}

function drawMover(ctx, mover, palette) {
  ctx.fillStyle = palette.leaf
  roundRect(ctx, mover.x, mover.y, mover.w, mover.h, 7)
  ctx.fill()
}

function drawEnemy(ctx, enemy, time) {
  const bob = Math.sin(time * 5 + enemy.x) * 3
  ctx.save()
  ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2 + bob)
  ctx.fillStyle = '#2a1848'
  ctx.beginPath()
  ctx.ellipse(0, 0, 12, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f4a2ff'
  ctx.fillRect(-5, -2, 3, 3)
  ctx.fillRect(2, -2, 3, 3)
  ctx.restore()
}

function drawShot(ctx, shot) {
  ctx.fillStyle = '#fff6c8'
  ctx.shadowColor = '#f4a2ff'
  ctx.shadowBlur = 12
  ctx.fillRect(shot.x, shot.y, shot.w, shot.h)
  ctx.shadowBlur = 0
}

function drawPlayer(ctx, player, time, palette) {
  if (player.invuln > 0 && Math.sin(time * 40) > 0) return
  const bob = player.onGround && Math.abs(player.vx) > 12 ? Math.sin(player.anim) * 2 : 0
  ctx.save()
  ctx.translate(player.x + player.w / 2, player.y + player.h + bob)
  ctx.scale(player.facing, 1)
  ctx.fillStyle = player.id === 'p2' ? '#85f2e0' : palette.accent
  ctx.beginPath()
  ctx.moveTo(-8, -8)
  ctx.quadraticCurveTo(-14, -20, -4, -28)
  ctx.lineTo(6, -16)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f7f4ff'
  ctx.fillRect(-5, -16, 10, 12)
  ctx.beginPath()
  ctx.arc(0, -22, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1b1430'
  ctx.fillRect(1, -24, 2, 2)
  ctx.fillStyle = '#fff1a8'
  ctx.shadowColor = '#fff1a8'
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(8, -12, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#241b3d'
  const step = Math.sin(player.anim) * 3
  ctx.fillRect(-5, -6, 3, 6 + step)
  ctx.fillRect(1, -6, 3, 6 - step)
  ctx.restore()
}

function drawHud(ctx, state, width, height) {
  ctx.fillStyle = 'rgba(7,8,18,0.55)'
  roundRect(ctx, 16, 14, 280, 58, 12)
  ctx.fill()
  ctx.fillStyle = '#f7f4ff'
  ctx.font = '600 16px Georgia, serif'
  ctx.fillText(`${state.level.world}`, 28, 36)
  ctx.font = '13px Georgia, serif'
  ctx.fillStyle = '#d9d3f5'
  ctx.fillText(`Level ${state.level.id} · ${state.level.name}`, 28, 56)
  const hearts = state.players.map((player) => `${player.id === 'p1' ? 'Lumen' : 'Echo'} ${'♥'.repeat(player.hearts)}`).join('   ')
  ctx.textAlign = 'right'
  ctx.fillText(hearts, width - 24, 34)
  ctx.fillText(`Sparks ${state.sparks}${state.level.keysNeeded ? ` · Keys ${state.keysHeld}/${state.level.keysNeeded}` : ''}`, width - 24, 56)
  ctx.textAlign = 'left'
  if (state.messageTime > 0 && state.message) {
    ctx.fillStyle = 'rgba(7,8,18,0.72)'
    const boxWidth = Math.min(width - 80, 640)
    roundRect(ctx, (width - boxWidth) / 2, height - 78, boxWidth, 42, 12)
    ctx.fill()
    ctx.fillStyle = '#f7f4ff'
    ctx.font = '15px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.message, width / 2, height - 52)
    ctx.textAlign = 'left'
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}
