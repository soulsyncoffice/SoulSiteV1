# SoulSite interaction modules

This directory provides isolated UI and service-boundary contracts for paired daily icebreakers, curated date proposals, provider-neutral private-call requests, and mutually opted-in activities. The modules are deliberately not wired into `App.jsx` or any backend; an authenticated application can import the components and connect their callbacks to its own service.

## Integration boundary

Every callback payload is an intent, not authority. The service must derive both participant identities from its authenticated session, validate membership in the same active match, enforce rate limits and access control, persist idempotently, and return server-authoritative state. Do not accept client-supplied participant IDs or trust browser entitlement, proposal status, prompt dates, or consent as proof of authorization. `validate*` functions provide shape and text-boundary checks only, not authorization or a substitute for server validation.

The daily prompt component sends only `{ promptId, answer }`. Keep answers private until both participants have submitted; provide an already-authorized answer to render only after server confirmation. The proposal callbacks send `{ activityId, note, proposedAt? }`, `{ proposalId, response }`, or `{ proposalId }`. Proposal records can include service-computed `permissions: { canRespond, canCancel }`; absent permissions default to no visible actions. The server should allow only a recipient to accept/decline and only the proposer to cancel; enforce those rules server-side. Activity opt-in sends `{ activityId, accepted }`; the server should record each person’s own consent separately and start an activity only when both opt in. Withdrawal must stop or revoke the activity according to the product policy.

## Voice/call capability contract

`PrivateCallSurface` fails closed unless the service supplies all of `providerReady: true`, `mediaConfigured: true`, `entitled: true`, `mutualConsent: true`, and a syntactically valid `providerId`. The optional `onRequestCall` callback is a provider-neutral call-request intent; the provider adapter and service must recheck entitlement and mutual consent at execution time. This UI neither requests microphone access nor captures audio, signals peers, nor creates a media session. It is not evidence that calls are implemented. Do not enable it for release until a vetted provider, authenticated signaling, privacy/security review, consent and revocation behavior, and operational monitoring are configured.

All user-provided text is length-bounded and rejects unsupported control characters. Text is rendered as ordinary React text nodes (never HTML); keep this rendering boundary if UI changes. Native labels, controls, visible status messages, keyboard focus indicators, skip/cancel actions, and explicit mutual-consent states are included.

## Tests

Run the dependency-free contract and state-machine tests with `node --test src/interactions/*.test.js`.
