# Progression features (items 15–20)

These are isolated, opt-in UI and domain modules. They are not wired into `App.jsx`, do not create multiplayer transport, and do not configure Supabase, Railway, or any other backend. `SOULSITE_IMPLEMENTATION_MAP.md` was not present in the repository when this module was added.

## Features

- `IcebreakerGame`: a local, prompt-only game with pass/next and replay. It has no player identity, answers, chat, persistence, or network activity.
- `DailyReflection`: a private reflection editor with save and retract callbacks.
- `MutualProgression`: request, withdraw, and end controls for a pair's shared progression.
- `CooperativeEvent`: private checklist activities, gated on current mutual consent; it has no chat or participant leaderboard.
- `AlignmentReflection`: a deterministic explanation of similarity across four non-sensitive preference dimensions. This is not a prediction, ranking, or measure of a person's worth.
- `FeedbackSafetyForm`: feedback and category-based safety reporting, with optional details.

## Adapter contract and trust boundaries

The callback props are integration seams, not implementations of authentication, authorization, durable storage, or moderation. Every callback that persists or mutates data must run on a trusted server and:

1. Derive the caller identity from a verified session; never trust a client-supplied user, pair, or recipient identity.
2. Check access to the exact private record/event and re-check current bilateral consent on every shared read or write. Consent must be independently recorded by both people; clients cannot activate it by sending a forged state.
3. Enforce private reflection ownership, consent withdrawal/end semantics, rate limits, and deletion/retraction atomically.
4. Moderate submitted free text on the trusted side. `moderateText` must resolve to `{ status: 'approved' }` only on explicit approval. Missing, rejected, errored, or malformed decisions fail closed. The safety form allows category-only reports so a rejected optional quote does not block reporting.
5. Return errors for UI display rather than treating missing adapters or failed operations as success.

The client-side state reducer and consent gate are for rendering and deterministic tests only; they are not security controls. No real-time, anonymous multiplayer, backend release, or production moderation provider is claimed.

## Validation

Run `node --test src/progression/domain.test.js` for domain, consent, moderation, and score behavior. The UI remains an adapter-only module until an authenticated backend and product navigation are deliberately integrated.
