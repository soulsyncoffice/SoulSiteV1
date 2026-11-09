# Trust and privacy modules

This self-contained React module covers appearance-free discovery, structured music/culture/hobby preferences with shared-hobby ranking, optional coarse-area consent, private reflection prompts, date safety/check-ins, block/report actions, and respectful closure prompts. Import `TrustPrivacyHub` from `src/trust/index.js`. It is intentionally not mounted from `App.jsx`.

## Integration contract

The component accepts initial display data and callbacks, but never accepts a signed-in user ID. Every write callback must use the application's authenticated server session to identify the actor; target profile references are only action subjects, not authorization credentials. Enforce authentication, authorization, validation, rate limits, retention, and block filtering on the server. A client-side filter is only a presentation safeguard.

Available callbacks receive:

| Callback | Payload |
| --- | --- |
| `onSavePreferences` | `{ connectionIntent, musicGenres, cultureInterests, hobbies }` |
| `onSaveAreaConsent` / `onRevokeAreaConsent` | `{ areaConsent }` with timestamps and a user-entered broad label, or a cleared label on revocation |
| `onBlockProfile` | `{ targetProfileId }` |
| `onSubmitSafetyReport` | `{ targetProfileId, category, details, visibility: "private" }` |
| `onSaveSafetyPlan` | `{ meetupLabel, expectedCheckInAt, trustedContact, visibility: "private" }` |
| `onCheckIn` | `{ status, submittedAt }` |
| `onSaveJournalEntry` | `{ content, createdAt, visibility: "private" }` |
| `onExportJournal` | no payload; authenticated service must provide a private export |
| `onDeleteJournalEntries` | no payload; deletes the signed-in owner's journal entries |

Discovery input `discoveryProfiles` may include profile reference, display name, connection intention, interest arrays, and an `areaConsent` object. The projection returns only those curated fields and a broad area when consent is valid. Photos, appearance, report content, contact details, journal data, precise location, and arbitrary server fields are never projected.

Area is manually entered (no geolocation or map provider) and consent is capped at 30 days. Address-like values, coordinates, and postal codes are rejected. Consent must be persisted and revocation/expiry honored by the server, not just hidden in the UI.

Journal, safety-plan, check-in, and report callbacks are interfaces only; this directory does not provide a storage or delivery service. Journal export/delete controls require the host to connect authenticated owner-only service operations; the module does not claim these actions succeeded unless the callback succeeds. The journal service must restrict reads/updates/deletes to its authenticated owner. Check-ins do not send alerts, notify contacts, track location, or contact emergency services unless an independently configured service explicitly implements and confirms that behavior. Reports are private payloads, never discovery data. Closure prompts are editable local text and are not sent automatically.

Optional personal details can be omitted. The host application should provide authenticated save/export/delete operations and explain the actual retention and delivery behavior before collecting sensitive data. Service errors are surfaced in the UI; missing callbacks are not treated as successful saves.

## Tests

Run the domain/privacy checks with `node --test src/trust/domain.test.js`.
