# Decisions

## Bug: countries in CSV imports — 21/09/2026

### Evidence and cause

Reproduction identified `12` and `XXX` in `docs/leads-with-errors.csv`
(lines 14, 16, and 18). The parser marked them as valid, and they reached
SQLite, the API, and the table unchanged. No UTF-8 corruption was reproduced:
`Iñaki Álvarez` was already being read correctly.

### Minimal fix

Validate in `frontend/src/utils/csvParser.ts` that a provided country consists
of two uppercase ASCII letters (`^[A-Z]{2}$`), after the existing trim.
An invalid row uses the error mechanism already displayed by the modal
and is excluded from the import request. Country remains optional.
Countries and accented characters are not transformed.

Validation checks the format, not membership in an ISO catalog. This preserves
the existing two-letter convention, including `UK` in the seed data,
without adding dependencies or defining new rules for accepted countries.
The scope is the application's CSV flow: no restrictions are added for
other API consumers, and historical records are not repaired.

### Verification

- Regression test loading the original CSV: all five rows with invalid countries
  (6, 11, 14, 16, and 18) receive a country error. The test failed before
  the change and passed afterward.
- The three `leads-ok-*.csv` files retain all their codes and remain
  valid. Checks also cover an empty country, whitespace, and accented fields
  (`Iñaki`, `Álvarez`, `Técnico`, `Compañía Ñ`, `Zoé`, `Muñoz`, `Éxito`).
- `pnpm test --run` in the frontend: 24/24 tests passed.
- Parser tests are grouped in `frontend/tests/csvParser.test.ts`,
  at the user's request, separate from production utilities.
- Live browser walkthrough: selected a UTF-8 file with five
  rows identified by `CSVFIX20260921`; the modal showed three valid rows
  (`ES`, `US`, empty) and two invalid rows (`12`, `XXX`). Import was clicked,
  and the three rows were verified in SQLite, `GET /leads`, and the table.
  Countries and accents remained intact; the two invalid rows did not
  reach the database or the table.
- The three temporary rows were removed afterward. The 29 existing records,
  including those from the previous reproduction, were preserved.
- `pnpm build` still fails due to the pre-existing TS2741 `emailVerified` error
  in `src/api/mutations/useApiMutation.ts:64`, unrelated to this change.

CSV work completed without changing emails or adding new fields.

## Bug: endless email verification with no feedback — 21/09/2026

### Cause and decision

The simulated activity takes 20 seconds for `jane.smith`, but the workflow
allowed only 1 second per attempt, with unlimited retries. The endpoint
waited for results sequentially, and the UI ignored partial errors.
The user confirmed that a failure must allow the remaining leads to continue.

The synchronous endpoint and data schema are preserved. Leads are processed
in parallel, each with its own result or error. No job system,
polling, or new dependencies are introduced.

### Limits and duplicates

- Activity: 5 seconds per attempt, at most 2 attempts, an initial retry delay
  of 1 second, and a total timeout of 12 seconds including queueing and retries.
- Workflow: 15 seconds of total execution time, even if no worker is available.
- Endpoint: Temporal connection limited to 3 seconds and a 20-second deadline
  for each lead's call. The connection is closed in `finally`.
- Browser request: a 25-second timeout specific to this endpoint.
  The subsequent table refresh does not keep the mutation pending.
- Stable ID per lead with `USE_EXISTING`: simultaneous requests reuse
  the active workflow. A new verification is allowed after it finishes.
- The UI shows overall and per-row progress, blocks another verification and
  deletion while pending, and allows retrying once it finishes.

### Results and errors

`true` means a valid email; `false`, an invalid email. Both are completed
checks. An exception or timeout goes into `errors`, not `results`, and does not
write `false` to the database: the lead's previous state is preserved. The response
sets `success: false` when technical failures occur, retaining partial results.
The UI shows counts of valid emails, invalid emails, and technical failures,
identifies failed leads, and avoids reporting overall success when errors occur.

The type of `emailVerified` in this operation's results is `boolean`,
aligned with the backend, so the counts use the value and its negation directly.
The lead's persisted state still allows `null` for unverified emails.

Technical errors are displayed during the UI session; no attempt history
is persisted. The Temporal timeout ends the workflow's wait, but
does not forcibly interrupt activity code that does not cooperate with cancellation.
A late completion of this activity does not update the lead: that write only
happens in the endpoint when it receives a successful result.

### Verification

- Backend: 31 tests passed and build succeeded. The new tests are
  in `backend/tests`; they cover limits, failure propagation, actual activity
  cases, partial results, batch continuation, and connection failure.
- Frontend: 26 tests passed, including CSV regressions and two new
  tests covering progress, duplicate blocking, partial errors, and request failure.
  The new tests are in `frontend/tests`.
- Live UI walkthrough with three temporary `EMAILFIX20260921` leads:
  valid and invalid results were saved while the slow lead remained pending. It finished
  after 11.08 seconds; Temporal confirmed `MAXIMUM_ATTEMPTS_REACHED` and workflow `FAILED`.
  The table showed `Valid`, `Invalid`, and `Verification failed` separately, alongside
  a notification reporting two completed checks and one technical failure.
- A second simultaneous request for the slow lead reused the same workflow:
  a single execution was confirmed in Temporal, with no retries pending at completion.
- Only the three rows created for the test were removed, and the 29 existing
  records were compared to confirm they remained intact.
- The frontend still fails to build due to the pre-existing TS2741 `emailVerified`
  error in `useApiMutation.ts:64`. This work is not expanded to fix it.

Email verification work completed.

## Block 3: new lead fields — 21/09/2026

### Scope and decisions

`phoneNumber`, `yearsAtCompany`, and `linkedinUrl` are added end to end:
Prisma and migration, create/read/update/import API, frontend types,
CSV and its preview, table, and message composition/generation.
“AI” is interpreted as API: this project generates messages from templates and
contains no AI integration. No new integration is added.

- All three fields are optional. The migration adds three nullable columns without
  rebuilding the table or changing previous values; existing leads
  receive `null` in the new columns.
- `phoneNumber` is text, never a JavaScript number: it preserves `+`, leading
  zeros, separators, and extensions present in the original CSV files. Leading
  and trailing whitespace is trimmed. Format validation allows 3 to 20
  digits in the main number, common separators, and an `x`/`ext` extension
  of up to 6 digits, with a maximum of 64 characters. It does not verify existence.
- `yearsAtCompany` represents completed years at the current company: an integer between
  0 and 2147483647 (the Prisma Int limit). `0` is valid and is preserved during import,
  display, and message generation. The API receives a number; the parser converts
  only non-empty CSV cells consisting entirely of digits.
- `yearsInRole` means years in the current role, not at the company. A person
  may have spent 8 years at the company and 2 in their role. This column is not renamed,
  converted, or used as a fallback for `yearsAtCompany`; it remains ignored in
  older CSV files. No tenure is invented for existing leads.
- `linkedinUrl` accepts an HTTP(S) profile URL with a `/in/...` path on `linkedin.com`
  or its subdomains, without credentials. Other protocols, other domains,
  domains that merely imitate LinkedIn, and company pages are rejected.
- The backend validates the fields during creation, update, and import. Creation and
  update return 400 before writing; import reports errors per row and continues
  with the others, following the existing flow. The modal now displays these
  backend failures. The CSV parser also detects invalid formats.
- On update, omitting a field preserves its value; `null` or empty text
  clears it. Two mismatches required for the flow are fixed: the frontend's
  `firstName` is accepted while retaining the `name` alias, and the client uses
  the existing `PATCH` method, which is also allowed in CORS. Updating only the new
  fields no longer writes `"undefined"` over the name/email. The response type reflects
  the lead returned by the API. Completing the optimistic lead's initial values
  also adds `emailVerified: null`, resolving the previous build error
  in that same object.
- The new variables are `{phoneNumber}`, `{yearsAtCompany}`, and `{linkedinUrl}`.
  The existing rule is preserved: if a template requires a missing field, only
  that lead fails, and its previous message is not replaced. If it does not require
  the field, generation proceeds normally. Numbers are converted to text without
  treating `0` as a missing value.

### Composition and example

The row of buttons is replaced with a searchable dropdown without
new dependencies, preserving colors and styles. It supports the mouse, arrow keys,
Enter, and Escape, indicates when there are no results, and returns focus to the editor.
It saves the cursor position/selection before moving to the search field, inserts at the
cursor or replaces the selected text, and leaves the cursor after the variable.

`docs/leads-new-fields.csv` contains three examples: complete data, empty
fields, and zero years with a phone number starting with `00`.

### Verification

- Backend: 71 tests passed and build succeeded. Coverage includes all three
  fields, invalid values, missing values, explicit clearing, partial updates,
  import, and generation with partial errors and zero years.
- Frontend: 38 tests passed and production build succeeded. They include
  older CSV files, new fields, separation from `yearsInRole`, search, insertion
  at the cursor, selection replacement, and consecutive keyboard insertions.
- Live browser walkthrough with the example CSV: 3 valid rows imported;
  preview, table, API, and SQLite preserved the values, including `0034`,
  `0`, and the name `Zoé`. Searching for `PHONE` and inserting the variable in
  the middle of text were checked, preserving the cursor and returning focus to the editor.
- Live generation with all three variables: 2 messages generated (5 and 0 years),
  and an explicit missing-phone error for Luis. After changing the template to
  `Hi {firstName}`, all 3 messages were generated successfully.
- Live API checks: partial update; rejection of a numeric phone number, negative
  tenure, and fake LinkedIn domain; explicit clearing and subsequent read.
- Only the three test leads (IDs 36–38) were removed. Comparison
  with the snapshot taken before the migration confirms that the 29 original leads
  retain all their previous values and have `null` in the new fields.

Block 3 completed. No new dependencies or refactoring unrelated to the flow.

### Requested adjustment: shared validators and `finally` — 21/09/2026

`shared/utils/validators.ts` is created at the root, with the folder name
corrected by the user. It centralizes format checks for email, phone,
LinkedIn, country, and tenure. Frontend and backend import this
file directly; duplicated expressions and checks are removed.
Normalization, required-field rules, and error presentation remain in each flow.
Existing rules are preserved: CSV converts valid year text, and the
API requires a number; zero remains valid. Email and country retain their
previous validation scope, without imposing new restrictions on the API.

In CSV reading, `setIsProcessing(false)` is moved to `finally` to
reset the state on both success and error, without repeating it in `try` and
`catch`. The Temporal connection was already closed in `finally`; pure
validation functions do not need a cleanup operation.

To compile the shared TypeScript without new dependencies, both projects
include `shared`. The backend expands `rootDir`, and its startup uses
`dist/backend/src/index.js`; development mode also watches `../shared`.
Vite allows shared files to be served from the project root.

Verification: all 71 backend tests and 38 frontend tests still pass;
both projects build. The compiled backend validator was also executed,
confirming that it resolves the shared module and preserves a phone number with leading zeros,
zero tenure, and a LinkedIn URL. No leads are modified in this adjustment.

### Renaming the common folder to `shared` — 21/09/2026

Following the user's rename, imports, TypeScript includes, and the folder
watched by backend development mode are corrected. The final
location is `shared/utils/validators.ts`, and references in this
document are updated to reflect it.

Verification: 71 backend tests and 38 frontend tests passed, builds
succeeded, and loading the shared module from the compiled backend was verified.

## Block 4: phone lookup with Temporal — 21/09/2026

### Execution and providers

The existing worker and queue are reused. `enrichPhoneWorkflow` queries
**Orion → Astra → Nimbus**, with one activity per provider, stopping when it finds
a valid phone number. `backend/src/phone/providers.ts` encapsulates inputs,
authentication, and normalization of each response. The exact URL
`https://api.enginy.ai/api/tmp/numbusLookup` from the README is preserved. The example keys
are those in the README and can be overridden with `ORION_API_KEY`, `ASTRA_API_KEY`,
and `NIMBUS_API_KEY`, exclusively in the backend.

- HTTP: 4 seconds with abort and timer cleanup in `finally`.
- Provider: 5 seconds per attempt, at most 3 attempts, backoff delays of 1 and 2
  seconds, and 20 seconds total including queueing. Network errors, timeouts,
  429, and 5xx are retried. Other HTTP errors, invalid JSON, or invalid phone numbers are not retried.
- Workflow: 90 seconds and a single attempt; it does not restart the entire chain.
- Read/persistence: independent activities, up to 3 attempts and 10 seconds
  total. If saving the phone number fails, another provider is not queried to
  hide that failure: execution fails, and the status query reports it.

After a provider's attempts are exhausted, its failure is recorded and processing continues.
`found` means a phone number was found; `not_found`, completed lookups without
results; `error`, no phone number and at least one technical failure; `missing_input`,
no phone number or technical failures, but providers were skipped due to missing data.
`preserved` indicates that a phone number added during the lookup was retained.

Orion accepts explicit absence with `phone: null`; Astra, a null or missing
`phoneNmbr`. HTTP 204 is interpreted as an explicit absence of content. The README
does not define an empty JSON response for Nimbus: unexpected JSON, including
`number: null`, is an error, not absence. Its number must be a positive safe integer;
it is stored as text without inventing prefixes from `countryCode`. This
adaptation cannot recover zeros that the provider already lost by sending it
as a number. No rate-limiting rules beyond the agreed scope are added.

### Data and write protection

The migration adds optional `companyWebsite` and metadata for status, provider,
diagnostics, start/end times, and request and execution identifiers.
`companyWebsite` flows through the API, CSV, types, preview, and table. The shared validator
accepts a domain or HTTP(S) URL and extracts its domain; it never infers it from the company
or email. Without an explicit website, Orion is skipped; without the required email/jobTitle,
the corresponding providers are skipped, and processing continues with those available.

Leads with a phone number are skipped. Admission uses an atomic conditional
update in SQLite before starting Temporal. Activities check the
current request, and the final write is transactional and conditional on the
field still being empty. A retry, late response, or earlier lookup cannot
overwrite or clear a phone number. No replacement action is added.

### API, duplicates, and feedback

`POST /leads/enrich-phones` returns **202** after starting executions, without
waiting for their results. It deduplicates IDs in the request. It uses the stable ID
`enrich-phone-{leadId}`, conflict policy `USE_EXISTING`, and reuse policy
`ALLOW_DUPLICATE`: an active lookup is reused, and a completed one allows a
new manual lookup if the lead still has no phone number. A request whose startup outcome
is ambiguous is marked as an error and invalidated to prevent late writes; if a
previous execution is still finishing, this is reported, and the user can retry.

`GET /leads/phone-enrichment` returns persisted statuses and checks active ones
against Temporal. It repairs pending statuses when execution has failed,
timed out, or never started, without modifying results already saved or
subsequent requests. A connection failure is reported as temporarily unavailable
status; it is not converted into “no data.” Connections are closed in `finally`.

The table shows the current provider, result, and diagnostics. React Query
polls every 2 seconds while lookups are active and restores the state on
reload. If the status query fails, it shows a warning and allows retrying. Starting
another lookup or deleting the selection is blocked while it has active lookups;
lookup is also blocked when all selected leads already have a phone number. Existing
styles are preserved, and no dependencies are added.

### Verification

- 109 backend tests and 44 frontend tests passed; both builds passed.
- Integration with real Temporal, isolated SQLite, and simulated HTTP providers:
  success with each provider, order, early stopping, absence, missing inputs,
  transient/permanent errors, malformed response, HTTP timeout, three
  attempts with 1/2-second delays, and three concurrent duplicate requests.
- Verified a 202 response before completion, a new execution when repeating a
  lookup with no result, preservation of existing phone numbers and those added during
  the lookup, and recovery from a workflow timeout without a worker.
- Real SQLite: a response from an old request does not write over the new one;
  repeating persistence does not replace a result already saved.
- Browser against the isolated environment: `companyWebsite` import, starting
  from “Find phone,” reload during Orion, restored progress, blocked
  controls, subsequent success with Astra, distinction between absence and missing inputs,
  manual repetition of a lookup with no result, and protection of the phone number found.
- Simulation in `backend/tests/fixtures/phoneFetch.cjs`, loaded only by the test
  process; reproducible walkthrough in `backend/tests/phoneEnrichment.integration.cjs`.
  `DATABASE_URL`, `PORT`, and `TASK_QUEUE` are allowed for isolation; the project's
  normal values are retained when these are not provided.
- No external providers were queried during testing. The 29 original leads
  were compared with the previous snapshot and retained their data.

Block 4 completed within the agreed design.
