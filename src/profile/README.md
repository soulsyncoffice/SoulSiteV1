# Profile builder and SoulMind

`ProfileBuilder.jsx` is an isolated React feature. It does not modify the application entrypoint, add a server, or own authentication or persistence. Import and mount it from the authenticated profile route when ready:

```jsx
<ProfileBuilder
  initialProfile={profile}
  onSave={async (profileDraft) => saveForCurrentAccount(profileDraft)}
  onDelete={async (profileId) => deleteForCurrentAccount(profileId)}
  onAssess={async (assessmentSubmission) => submitPrivateAssessment(assessmentSubmission)}
/>
```

`onSave(profileDraft)` receives `{ id, schemaVersion, answers, skippedSections, consent, overview, includeInOverview }`; `overview` is either `null` or the reviewed 500-word draft. It may return the persisted profile `{ id }` so the component can expose delete for a newly saved profile. The host must bind reads/writes/deletes to the current authenticated user, enforce consent independently, and keep the data private unless the corresponding consent is explicitly enabled. Do not trust client-provided identity, consent, or profile identifiers for authorization.

`initialProfile` may include the saved profile's `id`, `answers`, `skippedSections`, `consent`, `overview`, and `includeInOverview`. `onDelete(profileId)` is shown only for an existing profile and is called after explicit confirmation. The export button invokes optional `onExport(profileDraft)` or downloads a JSON file in the browser. The feature itself does not persist drafts or call external AI services.

All prompts are optional and each section can be skipped; skipping clears its answers from the current draft. The three `overviewRequired` answers are required only to generate the overview. SoulMind uses a deterministic local template, attributes entries to their prompts, JSON-quotes answer text, and refuses to truncate source content to satisfy the 500-word count. The overview uses only required answers plus optional answers explicitly selected for inclusion. Sensitive sections default out. Repeated excerpts are labelled and repeat exact answer tokens solely to meet the fixed length; they add no claims. An edited draft must remain exactly 500 whitespace-delimited words to be saved as an overview; otherwise the user can remove it and save the rest of the profile. Consumers must render overview text as text, never as HTML.

## Opt-in assessment

`AssessmentPanel` is mounted inside `ProfileBuilder` and requires the optional `onAssess(submission)` server integration. It adapts a follow-up from the user's selected answer, but performs no scoring or personality inference in the browser. It calls the handler only after explicit consent and complete answers. The request is `{ schemaVersion: 1, consented: true, answers }`; the builder filters answers to the active, predefined question IDs and option values. Assessment answers are held in component memory, are not included in the profile save/export, and are not added to the overview.

The assessment service must treat the request as untrusted, independently validate consent and allowed answers, calculate scores server-side (or return `null`), and return `{ schemaVersion: 1, dimensions, disclaimer }`. Each dimension has the canonical `id` and `label`, a score from `0` to `100` or `null`, a non-empty explanation, and evidence IDs that refer only to submitted answers. The response must explain all named dimensions. The client validates the result shape before display; this validation is not a scoring or authorization boundary. Do not persist or share these answers beyond the explicitly disclosed assessment behavior.

Run the isolated profile and assessment tests with:

```sh
node --test --test-concurrency=1 src/profile/soulmind.test.js src/profile/assessmentSchema.test.js
```
