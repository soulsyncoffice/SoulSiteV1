# SoulSite implementation map

This plan is based on the current code inventory at `4d13b8d`. It distinguishes existing functionality from planned work; entries below are not claims that the features are already implemented.

## Current baseline

- React 19, Vite 8, Three.js, Express 5, and `better-sqlite3`.
- `server/server.js` is the active API. It currently has public demo-profile and decision routes only.
- SQLite contains seeded demo profiles and anonymous decision history. The browser identity is a generated local-storage UUID.
- There is no authentication, user-owned profile API, messaging, moderation, subscriptions, location service, game engine, test suite, or AI integration.
- `backend/index.js` and its dependencies are legacy files and remain unused.
- Baseline `npm run lint` and `npm run build` pass. The production bundle is about 1.15 MB minified, including Three.js.
- Git baseline: `4d13b8d`; existing SQLite files are retained unchanged.

## Code status after this inventory

- Implemented locally: Supabase Auth UI (email/password, confirmation, recovery, sign-out), adult self-declaration, a private 25-area profile editor, per-field visibility preferences that default to private, authenticated profile APIs, contact-detail heuristics, account/profile deletion, Helmet response headers, and opt-in 500-word SoulMind story generation with a private saved draft and follow-up-question response.
- The story generator sends saved profile answers to OpenAI only after a per-request consent checkbox; it requires source-field references from the model and rejects outputs that are not exactly 500 whitespace-delimited words. This is not a semantic fact-check guarantee; every generated draft remains private and must be reviewed.
- Not verified against a live Supabase/OpenAI project: database migration execution, email deliverability, real account isolation, RPC account deletion, generation quality, provider policy/retention, or Railway environment configuration.
- None of the remaining 20-feature roadmap is represented as complete merely because an integration map exists. Public launch remains blocked on the release gates below.

## Target architecture and shared contracts

- **Authentication:** Supabase Auth (email/password to start); the browser holds the Supabase session and sends its access token as a bearer token to Express. Express verifies the token with Supabase Auth. Never trust a client-provided user ID.
- **Database:** Supabase Postgres with migrations. Private rows use `auth.uid()` ownership policies; server endpoints also verify the bearer token and authorize match membership. Keep the current SQLite file untouched during migration and cut over deliberately.
- **Profile visibility:** private by default. Only a separate, allow-listed discovery projection is match-visible; raw assessment answers, journal entries, reports, precise coordinates, and contact details are never returned in discovery responses.
- **API convention:** keep `server/server.js` as the one canonical app. Preserve `/api/config`, `/api/profiles`, and `/api/decision` route paths; evolve their identity and authorization semantics with authenticated users, and add authenticated routes under `/api`. Do not activate `backend/index.js`.
- **Policy layer:** one server-side normalization and contact/abuse policy for all user-controlled text. Fail closed for suspected contact details, explain blocks neutrally, retain an appeal path, and never promise perfect detection.
- **Incremental schema:** additive, versioned Supabase migrations with backup/export before production cutover. Avoid destructive migration of SQLite or existing decisions. Rollback by restoring the prior Railway deployment and retaining the old SQLite volume; reverse schema changes only after verifying no newer deployment uses them.

## Feature-to-component map

| Feature | Existing surface / planned components | Data and API boundary | Essential verification |
| --- | --- | --- | --- |
| 1. Anonymous soul introductions | Replace seeded profile UI in `src/App.jsx`; add profile-introduction editor, text prompts, and optional moderated media workflow | `profiles` plus a distinct public projection; `/api/my-profile`, `/api/profiles`; media storage only after moderation, never public raw media | Text/contact filter, consent, deletion, media authorization, no external identity leakage |
| 2. Personality and values | Add adaptive assessment UI and visibility controls | Private `assessment_answers`; compatibility service returns approved explanations, not raw answers | RLS/account isolation, consent visibility, revise answers, factor explanations |
| 3. Daily icebreakers | Add question catalog and matched-pair activity view | `icebreaker_sessions`, private answers until both submit; authenticated `/api/icebreakers` | Skip/no penalty, reveal only after both submit, contact filtering |
| 4. Curated date planning | Add proposal, mutual accept, reminder, cancel/reschedule UI | `date_proposals`; coarse area and mutual authorization; `/api/dates` | No exact address, only mutual changes, expire/cancel, text policy |
| 5. Private voice and date-day calls | Add paid entitlement checks, voice-message UI, call scheduling/signaling | Provider-managed encrypted media; 10 basic / 30 pro messages; call authorization only within six hours of date | Entitlement enforcement on server, consent withdrawal, no recording, rate limits |
| 6. Mutual activity planning | Add shared activity catalog and paired session UI | `activities`, `activity_sessions`; mutual acceptance and separate confirmation | No unilateral completion, message filtering, no forced retention |
| 7. Appearance-free discovery | Remove individualized appearance signals; standardized orb, theme and motion settings | Discovery projection excludes images and appearance fields | No image upload/reveal endpoints, reduced-motion/accessibility checks |
| 8. Music and shared culture | Add preference editor, licensed-preview/provider cards, mood game | Structured genres/moods and approved provider IDs; no arbitrary playlist URLs | Link rejection, provider licensing/attribution, no personal-account connection |
| 9. Privacy-preserving geography | Add coarse-area preference and temporary sharing controls | Coarse areas in discovery; precise location only in a consented, expiring safety feature | API/log leak tests, expiry, revoke immediately, repeated-query protections |
| 10. Trust-building activities | Add depth-selectable prompts and private reflections | Shared prompt answers separate from private reflection storage | Pass/revisit, never pressure for sensitive disclosure, consent-aware sharing |
| 11. Date safety and check-ins | Add checklist, voluntary reminders, block/report, trusted-contact setup | Separate safety service and restricted report access; emergency guidance is region-configured | Block/report authorization, contact secrecy, clear capability limits |
| 12. Mystery hobby matching | Extend hobby preferences and cooperative discovery cards | Opt-in interest catalog and paired activity sessions | No external accounts/links, opt-in follow-ups |
| 13. Private reflection journal | Add encrypted/private journal UI and export/delete controls | `journal_entries`, owner-only RLS; separate from matching APIs | Account isolation, no discovery/search exposure, deletion/export |
| 14. Respectful communication | Add pause/end/closure actions and block-evasion moderation | Match state, moderation events, approved closure-message catalog | No penalty for leaving, blocks enforced in every channel, no default read receipts |
| 15. Anonymous icebreaker games | Shared game catalog and in-app cooperative game surface | Game session IDs and fixed/validated inputs; no open identity fields | Contact filters on all input, hints/retries, accessibility |
| 16. Daily personal reflection | Private daily prompts and personal trend view | Owner-only `daily_reflections`; personalization requires explicit consent | No match exposure, no sensitive ranking/inference, opt out |
| 17. Mutual progression | Add optional milestones and pause/end controls | Per-user consent plus pair progression state | No implicit data unlocks, consent required from both, no deadlines |
| 18. Cooperative multiplayer events | Add moderated event/session UI and real-time provider integration | Authenticated real-time channels, generated player IDs, limited emotes | Reconnect/leave behavior, moderation, no external invitations |
| 19. Alignment and cooperation | Replace opaque single score with named dimensions and explanations | Server-validated event ledger and separate private/pair progression | Idempotent rewards, correction path, no worth/trust claims |
| 20. Feedback and improvement | Add optional post-activity feedback and safety report flow | Separate restricted reports from aggregate feedback; retention policy | Reports hidden from match, staff access audit, opt-in aggregation |

## Platform game and private network (cross-cutting)

- The requested platform game is a dedicated product track: evaluate a single Canvas/WebGL 2D implementation against the existing Three.js stack; implement a reusable engine, accessible solo/co-op play, deterministic level data, checkpoints, reconnection, and server-validated rewards.
- The 500-level requirement means 10 authored worlds of 50 distinct, reviewed levels each. A level must have an intentional layout, objective, mechanics, difficulty, completion condition, checkpoint, and accessibility notes. Procedural room variations do not count. Store level definitions as versioned data and run schema plus completion tests across all 500.
- Network foundation: authenticated identity, match authorization, messaging/policy, real-time game/call signaling, consent-limited location, safety/reporting, progression, and privacy-aware audit events. No unmoderated open chat, arbitrary images, or unrestricted external links.

## Delivery phases and external dependencies

1. **Identity and privacy foundation:** provision Supabase project, configure Auth/email delivery and Railway secrets, add migrations, authenticated API middleware, profile ownership/visibility, and account-isolation tests.
2. **Photo-free profiles and matching:** profile builder, factual overview assistant, assessment consent, allow-listed discovery, compatibility explanations, and safe decisions.
3. **Safety and policy foundation:** shared text policy, block/report, audit controls, deletion/retention, and abuse tests.
4. **In-app interaction:** icebreakers, activities, messaging, date proposals, and respectful closure.
5. **Media, subscriptions, and location:** select licensed voice/video and music providers, billing provider, consent workflow, coarse geography, and operational costs before implementation.
6. **Game and progression:** build/test the engine first, then author and verify 500 levels; add cooperative events and separate progression dimensions.
7. **Release hardening:** mobile/accessibility/performance, security review, migration rehearsal, Railway deployment, and rollback exercise.

Supabase Auth/Postgres costs depend on usage and plan. Voice/video, licensed music, email delivery, and subscriptions require separate provider and legal/licensing decisions; no provider credentials or budgets are configured in this repository. User profile copy assistance should remain deterministic and fact-grounded initially, with no third-party AI transmission unless separately opted into.

## Release gates

- Unit and integration coverage for each migration, auth/authorization, policy filtering, RLS isolation, block/report, consent expiry, and duplicate-reward prevention.
- End-to-end tests for profile creation/edit/delete, discovery visibility, match authorization, activities, and account deletion.
- Game level schema and completion validation for every authored level; real multiplayer tests before advertising cooperative play.
- `npm run lint`, `npm run build`, server/API smoke tests, dependency/security checks, mobile/reduced-motion checks, and a production migration/rollback rehearsal.
- Release notes must label each feature completed, partial, or not implemented and identify provider setup, costs, and remaining risks.
