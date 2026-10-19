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

Create a Railway service from the repository root (`soulsyncoffice/SoulSiteV1`) and use these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `/` (repository root) |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Healthcheck Path | `/health` |
| Public domain | In the service's **Settings → Networking**, generate a Railway domain |

Railway supplies `PORT`; no manual port variable is needed. Attach a persistent Volume to the service with mount path `/app/server/data`. The default SQLite directory resolves to `server/data` beside the API source, which is `/app/server/data` in the standard Railway app root. If your service uses a different runtime root or mount location, set `SOULSITE_DATA_DIR` to the mount's absolute path. Keep the database filename `soulsync.db`: it preserves the existing local database layout. Without a mounted volume, SQLite data is ephemeral and can be lost when the service is redeployed.

The project requires Node.js 22.12 or newer.

Run **one replica** while using this SQLite volume; Railway volumes are attached to an instance and SQLite is not a shared multi-replica database. Use a shared database service before increasing replicas.

## Supabase identity and decision storage

Without Supabase settings, SoulSite keeps its local SQLite demo behavior. To enable accounts and managed decision storage:

1. Create a Supabase project and apply `supabase/migrations/20261019000000_identity_decisions.sql` in its SQL editor (or with the Supabase CLI).
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment so the browser can use Supabase email/password sign-in and registration.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the server environment. The service-role key is server-only: never use a `VITE_` prefix, expose it to the browser, or commit it.
4. In Supabase Authentication settings, configure the production Site URL and allowed redirect URLs for the Railway domain. Choose the email-confirmation policy appropriate for the service.
5. Rebuild and redeploy so the frontend and server use the same Supabase project.

The server validates bearer tokens with Supabase Auth. Authenticated decision reads are scoped to the verified user's UUID and protected by RLS. Decision writes use the server-only service-role key after identity verification; database privileges prevent browser clients from inserting rows, and a database trigger enforces daily YES limits atomically. The public anon key is not a secret. Never configure a service-role key in the frontend.

Supabase is not enabled unless all three server variables are configured. Server startup fails fast if only some are provided; the browser variables must also be set at build time. The SQLite database remains untouched as a local demo and rollback path. Existing SQLite decisions are not migrated automatically.

## Matching API

The UI loads tier limits from `GET /api/config`, profiles from `GET /api/profiles`, and submits YES/NO decisions to `POST /api/decision`. With Supabase configured, `GET /api/decision/usage` returns the signed-in user's daily usage; both usage and decision submission require an `Authorization` header carrying the signed-in user's bearer token. The API enforces daily YES limits and returns compatibility scores and planning suggestions. The local database defaults to `server/data/soulsync.db`; set `SOULSITE_DATA_DIR` to override its directory.

The app retains its existing browser local-storage keys and SQLite filename so existing anonymous IDs, daily counts, and database contents are not stranded by the SoulSite rebrand. Run `npm test` for API behavior and auth-gating coverage.
