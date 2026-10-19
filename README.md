# SoulSite

SoulSite is being built as a privacy-first, appearance-free connection service. The Express service in `server/server.js` is the canonical API and serves the React app in production. The GitHub repository remains `soulsyncoffice/SoulSiteV1`.

**Release status:** this repository is not ready for public dating-service launch. The current discovery feed and decisions remain a seeded SQLite prototype; authenticated profiles are private account storage only. Matching authorization, public profile moderation, messaging, reporting/blocking, safety workflows, billing, calls, location features, and the cooperative game are not yet implemented. See [`SOULSITE_IMPLEMENTATION_MAP.md`](SOULSITE_IMPLEMENTATION_MAP.md) for the staged roadmap and release gates. Do not advertise unimplemented safeguards or features.

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

## Authenticated private profiles (foundation stage)

Account sign-up and private profile storage use Supabase Auth and Supabase Postgres. Account data is not added to the seeded public discovery feed. Per-field visibility values are stored as preferences only; no discovery sharing is implemented yet.

1. Create a Supabase project and apply `supabase/migrations/202606110001_private_profiles.sql` using the Supabase SQL editor or your reviewed migration workflow.
2. In Supabase Auth settings, configure email confirmation, password requirements, the production Site URL and allowed redirect URLs for the deployed domain; configure reliable SMTP before accepting public sign-ups. Add `http://localhost:5173` for local development.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as Railway service variables. The service-role key must remain server-only and must never use a `VITE_` prefix.
4. Rebuild/redeploy after setting the `VITE_` values; Vite embeds them at build time. Runtime service variables are read by Express.

The server verifies each bearer token with Supabase Auth, derives the user ID from the verified identity, and scopes private profile requests to that ID. Profile data is written through the server using the secret service-role credential because the server applies age and contact-detail validation; direct `anon` and `authenticated` table grants are revoked. The table also has row-level security as defense in depth. Never use the service-role key in browser code or logs.

The account flow includes email/password sign-up, email confirmation, sign-in, password reset, sign-out, private-profile create/read/update/delete, and confirmed account deletion. Account deletion removes the Supabase Auth identity and cascades its private profile; the local overview-rate-limit records for that account are also removed. Age and adult confirmation are stored in Supabase Auth metadata to gate private profile access and are self-reported, **not** identity or age verification. Deleting only the profile does not delete the still-active account or its age metadata. The profile guide is rule-based. An optional SoulMind overview request sends the saved profile answers to OpenAI only after an explicit per-request consent; the generated 500-word draft is stored privately, and SoulMind asks for more detail if it cannot ground a story in the supplied information. OpenAI's separate privacy/retention terms apply to that request. Overview requests are limited to three per account per hour. Contact screening is a lightweight heuristic for text fields—not comprehensive moderation—and does not inspect voice, video, images, or game content. Visibility preferences have no publication effect until a separately authorized discovery system is implemented.

For overview generation, set `OPENAI_API_KEY` as a Railway server variable. Optionally set `SOULSITE_OVERVIEW_MODEL` to a model enabled for your OpenAI account; the default is `gpt-4.1-mini`. Do not place this key in a `VITE_` variable. Story requests require a signed-in user, an already-saved profile, and a separate consent action. The generated story is a draft for the user to review, not a guarantee against model errors or a replacement for human moderation.

Before production user onboarding, complete the roadmap's account deletion/data export and retention policy, privacy notice and terms, independently review authentication and database policies, configure abuse reporting and moderation, and test recovery and account isolation against the actual Supabase project. A missing Supabase configuration intentionally disables account sign-up; it does not silently save private data to the browser or SQLite.
