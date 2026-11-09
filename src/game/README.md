# SoulSite game module

This is an isolated, deterministic, integration-ready game core. It has no network, database, or credential dependencies and is not wired into the existing app UI or API.

## Run checks

```sh
node src/game/validator/validateLevels.js
node --test src/game/test/game.test.js
```

## Core API

Import `src/game/index.js` for the level catalog and engine API. `createInitialState(level, playerCount)` starts a solo or co-op session; `simulateStep(level, state, inputs)` applies deterministic turn-based inputs; `serializeCheckpoint(level, state)` and `restoreCheckpoint(level, checkpoint)` persist reconnect-safe snapshots tied to an exact engine and level version.

Inputs accept arrow keys, WASD, direction names, and Enter/Space for interaction. A UI can expose equivalent accessible buttons; no level requires audio, color-only cues, or timed reactions. Grid markers: `#` wall, `.` floor, `S` spawn, `R` checkpoint, `E` exit, `C` collectible, `T` switch, `G` locked gate, `H` reset hazard, and `P` co-op plate.

## Authenticated integration boundary

`createGameIntegration` in `state/model.js` requires three injected functions: `submitReward`, `syncState`, and `loadCheckpoint`. This deliberately leaves auth tokens, Supabase access, and network policy to the app's authenticated server adapter. The game module does **not** verify reward claims, grant rewards, synchronize multiplayer sessions, or trust client-reported completion. The future server should authorize each operation from the authenticated user, validate level/version and authoritative action history, and persist state and rewards server-side. Do not treat a client checkpoint or completion flag as proof of a reward.

## Level authoring status

`levels/levels.json` contains 20 manually authored levels across 10 named worlds. Each entry has its own map, objective, mechanics, difficulty, checkpoint, and accessibility notes. This is a validated subset, not the requested 500-level catalog. The validator checks required fields, allowed mechanics/objectives/tiles, unique maps and IDs, objective markers, checkpoint coordinates, and basic reachability; it enforces 10 worlds with levels 1–50 if a 500-entry catalog is supplied.
