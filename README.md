# SoulSite

SoulSite is an anonymous compatibility-discovery MVP. The Express/SQLite service in `server/server.js` is the canonical API and serves the built React app in production. The GitHub repository remains `soulsyncoffice/SoulSiteV1`.

## Run locally

Install dependencies with `npm install`. For frontend development, run the API and Vite in separate terminals:

```sh
npm run backend
npm run dev
```

Vite runs at `http://localhost:5173` and proxies `/api` to the API on port 3001. For a production-like local run, build and start the combined server:

```sh
npm run build
npm start
```

The server listens on `PORT` (default `3001`) and binds to `0.0.0.0`. It serves the frontend build, supports client-side routes, and exposes `GET /health` for health checks.

## Deploy to Railway

Connect the GitHub repository `soulsyncoffice/SoulSiteV1` to a Railway project and create a service from the repository root. Set the service's watched/deploy branch to `main`; Railway deploys commits on that branch, so changes on open pull requests do not reach production until merged. The root `railway.json` supplies the build, start, healthcheck, and restart settings:

| Setting | Value |
| --- | --- |
| Root Directory | `/` (repository root; do not set a subdirectory) |
| Runtime | Node.js 22.12 or newer (from `package.json`) |
| Builder | Railpack |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Healthcheck Path | `/health` |
| Public domain | In the service's **Settings → Networking**, generate a Railway domain |

Railway supplies `PORT`; no manual port variable or application secrets are currently required. Attach a persistent Volume to the service with mount path `/app/server/data`. The default SQLite directory resolves to `server/data` beside the API source, which is `/app/server/data` in the standard Railway app root. If your service uses a different runtime root or mount location, set `SOULSITE_DATA_DIR` to the mount's absolute path. Keep the database filename `soulsync.db`: it preserves the existing local database layout. Without a mounted volume, SQLite data is ephemeral and can be lost when the service is redeployed.

The project requires Node.js 22.12 or newer.

Run **one replica** while using this SQLite volume; Railway volumes are attached to an instance and SQLite is not a shared multi-replica database. Use a shared database service before increasing replicas.

After linking the repo, confirm the service is tracking `main`, the root directory is `/`, and the volume is mounted at `/app/server/data`. Check Railway's deployment/build logs if the build fails; check runtime logs and the healthcheck result if startup fails. A successful deployment responds with `{"status":"ok"}` at `/health`.

## Matching API

The UI loads tier limits from `GET /api/config`, profiles from `GET /api/profiles`, and submits YES/NO decisions to `POST /api/decision`. The API enforces daily YES limits and returns compatibility scores and planning suggestions. The local database defaults to `server/data/soulsync.db`; set `SOULSITE_DATA_DIR` to override its directory.

The app retains its existing browser local-storage keys and SQLite filename so existing anonymous IDs, daily counts, and database contents are not stranded by the SoulSite rebrand.
