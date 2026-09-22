# Practice verification and improvements

Date: 21 September 2026. Audited code: `339ba6b`, compared with `87a3607`, which precedes the four practice commits. The working tree was clean at the start. This review adds this document; it does not change application code or automatically clean up tracked data.

The four modified user flows work in the local checks described below. No functional regressions were found in those cases. However, the diff contains accidental data changes, lint was already broken, and configuration and external validation limitations prevent us from describing the submission as fully verified.

## Delivered and verified

| Flow | Check performed during this review | Result and scope |
| --- | --- | --- |
| Country codes in CSV | Parser tests and a browser upload of six rows: four valid, two containing `12`/`XXX`. Subsequent API and SQLite checks. | The modal excluded the two invalid rows; only the four valid rows were persisted. `ES`, `US`, an empty country and `Zoé Muñoz` were preserved. Validation checks the two-uppercase-letter format, not membership in an ISO country list. |
| New fields | CSV → preview → table → API → SQLite; real create and PATCH requests; validation and explicit clearing. | `0034`, zero years, LinkedIn and the normalized domain were preserved. A partial PATCH preserved the name; a numeric phone value, negative years, a fake LinkedIn domain and an invalid website received 400 responses. `null`/empty values cleared the intended fields. |
| Message composition | Browser: searching for `PHONE`, replacing a selection with Enter, and checking focus/cursor position. Generation with the three new variables followed by a retry. | The editor inserted `Before {phoneNumber} after`. One message preserved `0`; two leads without a phone showed individual errors. Using `Hi {firstName}` generated messages for all three, confirmed through the API. Component tests also cover consecutive insertions and Escape. |
| Email verification | Browser with valid, invalid and slow cases; API/SQLite checks and the execution description in Temporal. | The UI showed `Valid`, `Invalid` and `Verification failed`, with two checked leads and one technical failure. The slow case finished in **11.056 s**, `FAILED`, after exhausting its attempts; it retained `emailVerified: null`. Enrich and Delete were disabled during the request. The email activity remains the project's simulation, not a real verification service. |
| Phone lookup | Existing integration runner against the compiled API, real Temporal, isolated SQLite and mocked provider `fetch` calls. | All 12 runner scenarios passed: success from each provider, ordering, early exit, no data, missing input, errors, invalid JSON, retries and HTTP timeout. Three concurrent duplicate requests, an existing phone, a phone added during lookup and a new execution after an empty result also passed. Runner duration: **16.949 s**. |
| Persistence and recovery | The integration above and additional calls to the compiled activity against real SQLite. | An old request did not overwrite the current request; repeated persistence did not replace the result. The state of a workflow without a worker was repaired. **That case uses a 1 s test timeout**, rather than waiting for the configured 90 s production timeout. |
| Phone lookup feedback | Browser: Find phone, duplicate/deletion blocking, reload during an active lookup, and observation of progress and completion. | State survived the reload, progressed to Nimbus and displayed its phone number. No-data, missing-input and technical-failure states were also observed in the table using runner data. External providers were not involved. |
| Migrations | Prisma validation; six migrations applied to a new database through Prisma; the two new migrations applied to a copy of the Git baseline SQLite database. | Schema validation and migrations passed. The 25 records from `87a3607` retained their original column values; new fields were `null`. Prisma used a temporary schema copy pointing to an isolated database. |

### Tests, builds and baseline comparison

Checks used **Node 22.23.2**, consistent with both `.nvmrc` files, and the dependencies already installed. The comparison used a temporary export of `87a3607` with the same dependencies; it does not represent an independent clean installation.

| Check | Baseline `87a3607` | Current `339ba6b` | Classification |
| --- | --- | --- | --- |
| Backend: `./node_modules/.bin/vitest run` | 24/24 | **109/109**, eight files | Passed. |
| Frontend: `./node_modules/.bin/vitest run` | 19/19 | **44/44**, four files | Passed. |
| Backend: TypeScript (`tsc -p .`, the `build` script) | Passed | **Passed**; the compiled output was started for integration testing | No regression detected. |
| Frontend: `npm run build` | TS2741: `emailVerified` was missing from the optimistic lead object | **Passed**, TypeScript and Vite | Existing failure fixed by the changes. |
| Frontend: `npm run lint` | Fails: ESLint 9 cannot find `eslint.config.*` | Same failure | **Pre-existing and unresolved**. Code analysis did not run; this does not mean there are zero lint errors. |
| `prisma validate` / isolated migrations | Deployment to a nonexistent file reproduces the error described below | Validation and all six migrations passed after preparing the SQLite file | No failure of the new migrations was observed. |
| `git diff --check 87a3607..HEAD` | Not applicable | Passed | No whitespace errors detected. |

Environment issues, distinguished from functional failures:

- The initial environment used Node 25.9.0 and pnpm 11.19.0. `pnpm test --run`, the chained build and lint were blocked before execution by `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: pnpm attempted to reinstall dependencies. Checks switched to Node 22 and local executables/npm; dependency removal was not forced and lockfiles were not changed. This was a tooling blocker, not a failed test.
- `prisma migrate deploy` returned `Schema engine error` when the target SQLite file did not exist, with both the baseline and current schemas. After creating an empty file, all six current migrations passed. The engine's underlying cause was not determined; the symptom is not specific to these changes.
- Route unit tests mock Express/Prisma/Temporal, and component tests mock the API. The integration and real user flows described above complement those tests; the entire suite is not presented as end-to-end testing.

## Diff and data review

The review covered the inventory of **55 changed files**, implementation/configuration changes, migrations, tests and documentation, and credential-related matches in the diff.

- **Accidental file changes still unresolved:** `backend/prisma/dev.db` was already tracked in the baseline and changed during the practice. The baseline contains 25 leads; HEAD contains 29. IDs **26–29** were added, and IDs **4 and 5** have changes to `updatedAt` and `emailVerified` (the latter from `null` to `true`). These changes already appear in `6483af1`; they are not needed for the CSV fix. The later columns and migrations do correspond to the requirements. The working database was neither restored nor deleted during this audit.
- The reference to “29 original records” in `DECISIONS.md` concerns later working snapshots. It does not establish equality with the **25 records in the baseline commit**. These comparisons must remain distinct when presenting the submission.
- **Credentials:** the three default keys introduced in `backend/src/phone/providers.ts` exactly match the samples already published in the README. No new private keys or tokens matching the reviewed signatures were detected. URLs containing a username/password are negative validation test cases. This is a static review, not an exhaustive guarantee that no secrets exist.
- The sample provider values do not appear in the compiled frontend JavaScript. `frontend/.env` was already tracked and contains `VITE_API_URL`; `backend/.env.sample` also already existed. Neither changes in the diff. No environment credentials were copied into the repository.
- No `node_modules`, compiled `dist` files, logs or `.DS_Store` files are tracked. Dependencies and lockfiles are unchanged. Fixtures intercept provider calls only when explicitly preloaded into the test process.
- `companyWebsite`, the PATCH/CORS changes, the optimistic lead defaults and the new compiled startup path relate to the delivered flows. Moving the CSV test to `frontend/tests` preserves and extends its tests. No other changes unrelated to the practice were identified.
- The working database had the same SHA-256 before and after testing: checks used isolated data and a separate Temporal task queue. The tracked SQLite database was not used as the test database.

## Outstanding submission work

The four functional areas are implemented and verified within the scope above. The following outstanding items must not be presented as completed functionality:

### P1 — Remove runtime data from the diff

- **Observed problem:** the SQLite binary combines the deliverable schema with the data changes described above.
- **Impact:** the reviewer receives local test results as initial data; the binary diff obscures changes the exercise does not require.
- **Proposal:** keep a local backup, stop tracking the runtime SQLite database and provide a deterministic seed if examples are needed. Deliver the schema through migrations; do not delete the user's local data as a cleanup method.
- **Estimated effort:** 1–2 hours.
- **Acceptance criterion:** a clean checkout can be prepared using migrations/seed; the diff contains no test execution state or mutable SQLite database; the local copy retains its data. Document that this removes tracking of a file that already existed in the baseline.

### P1 — Complete or provide evidence of the PR review requested in the README

- **Observed problem:** the audited tree contains no report or reference establishing that the external review was completed with a final decision. Reviewing this diff does not replace that task.
- **Impact:** one assignment requirement lacks evidence in this submission.
- **Proposal:** identify the relevant PR and provide a review with actionable comments and an explicit approve or request-changes decision. This audit did not publish external comments or reviews.
- **Estimated effort:** 30–60 minutes, depending on PR size.
- **Acceptance criterion:** a link to the review and decision, with findings tied to the reviewed code. If the review already happened outside the repository, attaching that evidence is sufficient.

### P2 — Restore an executable quality check

- **Observed problem:** lint fails in both the baseline and HEAD because ESLint 9 is paired with `.eslintrc.cjs`; the global package manager also could not run the scripts with the installed dependencies.
- **Impact:** there is no usable lint result, and reproducibility depends on the local environment.
- **Proposal:** migrate the configuration to the format supported by the installed ESLint version, define the scope for application/test/generated files and pin a compatible pnpm version. Resolve any actual errors revealed without hiding them through blanket rule disabling.
- **Estimated effort:** 2–4 hours, subject to revision once analysis can run.
- **Acceptance criterion:** a reproducible installation using lockfiles and Node 22; tests, both builds and lint complete successfully from a clean checkout.

## Outstanding external validation and actual limits

No requests were made to Orion, Astra or Nimbus. Their adapters were tested with simulated responses and real Temporal. Therefore, **authentication accepted by the external server, availability, latency, phone data quality, actual no-data responses and current quotas remain unverified**.

The [README](README.md) states that RPS/RPM are unlimited for the exercise and announces future limits without specifying numbers for each provider. This is assignment information, not a measurement or current confirmation from the service. There is no basis for documenting an actual “X requests per second/minute” quota.

| Implemented limit | Value/configuration | Evidence and limitation |
| --- | --- | --- |
| Phone HTTP request | Aborted after 4 s | Test with a fake clock and integration with a simulated slow provider. |
| Provider activity | 5 s per attempt; up to 3 attempts; 1/2 s backoff; 20 s including queue time | Configuration and retries/backoff checked with real Temporal. |
| Phone workflow | 90 s; one workflow attempt | Configuration checked. Recovery without a worker was tested with a reduced 1 s timeout. |
| Provider quota | **No RPS/RPM limiter** | The code retries 429 responses but does not process `Retry-After`, add jitter or coordinate quotas across workers. The 429 case was tested with a mock; no external 429 response was observed. |
| Requests per lookup | Up to three calls per provider; up to nine across the chain if all providers exhaust their attempts | An upper bound derived from the policy, not a global quota or a guaranteed request count. Multiple leads can run in parallel. |
| Phone polling | Every 2 s while lookups are active; 5 s when the status query fails | Hook configuration; progress and reload were checked. Performance with many users/leads was not measured. |
| Email | Activity: 5 s, two attempts, 12 s including queue time; workflow: 15 s; per-lead deadline: 20 s; browser: 25 s | Configuration, tests and the 11.056 s slow case. These are limits at individual layers, not a measured SLA for the entire endpoint under load. |

Other specific limitations:

- **Nimbus:** the assignment's `numbusLookup` path is preserved. Its actual no-data contract was not confirmed; the adapter accepts HTTP 204 but treats unexpected JSON as an error. Its numeric response may already have lost leading zeros, and `countryCode` is not defined as a telephone dialing prefix. No international conversion is guessed.
- **Missing input:** Orion is skipped without an explicit website; Nimbus is skipped without `jobTitle`. The table reports `missing_input`; the UI has no editor for those details. New fields can be imported and updated through the API. No data correction through a nonexistent form was claimed as verified.
- **Emails:** technical failures exist only in UI state, with no persisted attempt history. The slow simulation does not cooperate with cancellation: a Temporal timeout does not stop its code. The endpoint does not save its late result.
- **Countries and phones:** CSV validation checks format, not membership in a country list or whether a phone number exists. Country validation does not cover direct API consumers or repair historical data.
- **Environment:** there was no fresh installation, load test, multiple-worker test, full mobile validation or exhaustive accessibility audit. Browser smoke testing used Vite in development mode; the production build passed, but it was not exercised in the browser through `vite preview`.

## Future improvements grounded in these findings

Priorities: **P1** before enabling quotas/real providers or relying on isolation; **P2** to make the delivered functionality reproducible and operable. Estimates include implementation and testing, not time waiting for third parties. These proposals are not implemented and are not completed functional requirements.

### P1 — Configure and enforce quotas per provider

- **Problem:** `phone/providers.ts` retries 429 responses as ordinary transient failures; `phone/routes.ts` admits all valid IDs in parallel. Sequential execution for each lead does not control the total number of requests across leads or workers.
- **Impact:** once quotas are introduced, retries from many leads can consume them again and fail before a lookup can complete.
- **Proposal:** obtain RPS/RPM, burst allowances and quota scope for each account/provider; make them configurable and enforce them through a shared limiter. Respect `Retry-After` as seconds or a date, add jitter and distinguish quota waiting from execution time. Review the overall 90 s limit if queue waiting is introduced.
- **Estimated effort:** 1–2 days once the quota contract is confirmed.
- **Acceptance criterion:** with two workers and artificially low quotas, aggregate calls respect both limits; a 429 does not trigger a burst; waiting is visible and does not produce false “No data found” results. Do not set real quota values without provider documentation.

### P1 — Use the same database target for Prisma and the API

- **Problem:** `src/db.ts` supports `DATABASE_URL`, but `prisma/schema.prisma` hardcodes `file:./dev.db`. Running `prisma migrate status` with `DATABASE_URL` pointing to the isolated database still made the CLI report `file:./dev.db`. The fixed URL is inherited; the divergence from the new runtime override appears with these changes.
- **Impact:** the API and migrations can operate on different databases. Exporting a variable is not enough to isolate a migration.
- **Proposal:** use a single datasource configuration with explicit development and test instructions. Prepare SQLite and apply migrations from the same integration startup script.
- **Estimated effort:** 2–4 hours.
- **Acceptance criterion:** with a temporary URL, both API and CLI operate only on that database; applying migrations and inserting a lead leave the hash of `backend/prisma/dev.db` unchanged. The script fails if its isolated target is not configured.

### P1 — Confirm external contracts and separate sample credentials

- **Problem:** responses and authentication have been tested with fixtures; Nimbus has the ambiguities described above, and sample keys are used as fallbacks in production code.
- **Impact:** passing tests does not guarantee that a real request authenticates or that a no-data response is interpreted correctly. Incomplete configuration can silently use sample values.
- **Proposal:** agree on success/no-data/error contracts and phone formats, add contract tests against a provider environment using synthetic data, and require environment-specific credentials outside demo mode. Redact the Nimbus key parameter from any URL logging as well.
- **Estimated effort:** half a day–1 day, excluding external coordination.
- **Acceptance criterion:** evidence for each provider covering authentication, success, no data, 429 and permanent errors; fixtures aligned with agreed responses; no keys in frontend/logs and a clear startup failure for incomplete configuration outside demo mode.

### P2 — Make the existing integration test self-contained

- **Problem:** `tests/phoneEnrichment.integration.cjs` is not part of `vitest run`; it requires a server on port 4001, a prepared database, environment variables, a dedicated queue and preloaded `phoneFetch.cjs`. This audit had to prepare that environment.
- **Impact:** all 153 unit/component tests can pass without checking persistence, Temporal execution or startup of the compiled application.
- **Proposal:** add a command that creates a temporary environment, applies migrations, starts the API/worker, waits for readiness, runs the test runner and cleans up only its own processes/data through `finally`. Make the port/address configurable and run this check in the repository's automated validation.
- **Estimated effort:** half a day–1 day.
- **Acceptance criterion:** one command runs the existing scenarios from a clean checkout; it works while the normal development environment is running; it makes no external provider calls, does not touch the tracked SQLite database and returns an error if Temporal is unavailable or an assertion fails.

### P2 — Bound batches and progress queries before scaling

- **Problem observed through inspection:** the email/phone endpoints use `Promise.all` without an explicit batch/concurrency limit. `/leads/phone-enrichment` loads all active lookups, queries Temporal for each and returns all leads; every browser repeats that operation. Saturation under load has not been demonstrated.
- **Expected impact:** more RPCs, connections and SQLite work per user and batch; time spent in the queue can consume the existing deadlines.
- **Proposal:** define maximum batch size and concurrency based on a load test, query progress by IDs/page and share the Temporal connection. Separate the API and worker so that a worker startup failure does not also terminate the API, as the inherited `process.exit(1)` currently allows.
- **Estimated effort:** 1–2 days.
- **Acceptance criterion:** an agreed load with explicit batch size/concurrency, an RPC count proportional to the leads being queried and overload feedback; a worker failure does not bring down CRUD operations. Measure these results before promising capacity.

### P2 — Persist verification state and tie it to the checked email

- **Problem observed through inspection:** only `emailVerified` is stored; technical failures are not persisted, and the final write is conditioned on the ID rather than the email that started verification. PATCH allows that email to change. The concurrent editing race was not reproduced in this review.
- **Impact:** reloading loses the failure explanation; a result for an old address could be applied to a new one.
- **Proposal:** record the checked address/version, timestamp and last attempt's status; save results only if the address still matches. Restore technical failures after reload and support cooperative cancellation in the activity when replacing the simulation.
- **Estimated effort:** half a day–1 day.
- **Acceptance criterion:** a failure preserves the previous result and remains visible after reload; a test that changes the email during the activity demonstrates that the old response does not verify the new address.

## Final verification status

The four modified flows work in the executed cases; **153 tests**, both builds, isolated migrations and integration with Temporal pass. Browser checks confirm CSV import, new fields/composition, partial email results and phone progress after reload. Cleaning up tracked data, providing evidence of the PR review and restoring lint remain outstanding. Real provider validation, their quotas and the improvements above remain open; none is presented as tested or delivered.
