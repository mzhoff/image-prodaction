# Runtime v2 — local implementation and verification

Date: 2026-09-05. Implemented, locally verified and installed in the existing local
Docker stack. Not committed, published to Git, deployed to production, or migrated
in Content Hub.

## Context and scope

Live [Notion product card](https://app.notion.com/p/3b875415801481bd9672e1115d5d5811)
read during this task: Image Production, P1, Active focus,
Pilot, last edited 2026-08-31. The local MVP combines visual pipeline authoring,
PostgreSQL/storage and a durable worker. The next product evidence gate remains a
pinned `story.asset.render.v1` vertical and 20 measured runs (QA, cost, cycle time,
manual correction, stability). The approved Runtime v2 work is a bounded connector
for a real Content Hub consumer, not a new CMS, Identity, Billing or microservice.
This implementation does not itself pass the 20 paid/real-result product gate.

Initial branch: `codex/stories-contract-presets`; HEAD:
`ce07804be92bc8d38b5e30ea85e6cc5aa42b90df`. The 38 tracked modified and 10 untracked
paths at baseline belonged to prior work in this task (Input, Export and assistant
knowledge). They were preserved. No new branch, worktree, project copy, stash,
commit, PR, merge, push or production deployment was made.
Final working tree: 82 tracked modified + 91 untracked paths (173 total), including
the preserved prior node work; branch and HEAD remain unchanged.

Architecture: one Workspace/app/reference connection → rotatable keys → separate
pinned grants → immutable durable runs. Raw keys are one-time; server storage is
hashed, CLI delivery is a new outside-repository file with mode 0600. Session
management is owner/admin only, external permissions are scoped, grants cannot
silently advance with publication. API v2 uses canonical Zod/inferred types and
generated OpenAPI. Usage is production cost, not retail pricing.

Migration: `drizzle/0024_needy_hellcat.sql`, snapshot `0024_snapshot.json`, journal
entry. Adds clients, credentials, grants, audit, cost reservations and nullable
normalized run/generation/usage attribution; no legacy deletion or renaming.
Adds FK/check/index constraints and a cross-protocol idempotency guard. Fresh and
populated v1 upgrade paths are exercised on separate disposable local databases.

## Implementation map

| Layer | Main files / areas |
| --- | --- |
| Contracts | executable-pipelines `runtime-v2-contracts`, descriptor/run/semantic/OpenAPI and runtime-usage contracts; normalized usage attribution |
| Core | credential generation/checks, compatibility, exact decimal cost arithmetic, cap policy and usage aggregation |
| Server | runtime client/catalog/grant/auth services; v2 submit/read/cancel/artifact routes; dispatch reservations; normalized attribution; reconciliation |
| Adapters | PostgreSQL runtime/cost schemas, additive run fields, queue/terminal projections, worker heartbeat v2 marker, generation/usage persistence |
| UI | Settings integrations connection/key/grant/version/test components; canvas section capability authoring; session BFF |
| Routes | `app/v2/runtime/[...path]`; Workspace-scoped `runtime-connections/[...path]` |
| CLI / tests | `runtime-connections-cli`, migration/legacy/persistence/cutover/artifact smoke scripts; browser connection E2E |
| Docs | Runtime v2 ADR, cost semantics, this evidence report and separate Content Hub handoff; assistant publication guidance |

Prior node changes remain separate parts of the working diff. Updating section
capability changes only the draft and requires explicit new publication. Existing
pilot summary v6 and cover v5 were not rewritten, re-run, or republished.

## Compatibility

| Property | Existing v1 | Runtime v2 |
| --- | --- | --- |
| Authentication | Existing `rvr_pipe_*`, unchanged | Workspace connection `rvr_client_*` |
| Binding | Legacy consumer/pipeline | Separate grant per pinned capability |
| Response shape | No added v2 fields | Run ownership/pin/cost/usage snapshot |
| Idempotency | Existing scope retained | client + grant + key; independent of rotation |
| History | Preserved, original protocol | Own client/grant only; replacement key can read history |
| Cross-protocol same operation | 409 before a second physical run | Same guard, including concurrent submissions |
| Publication | Legacy existing behavior retained | Explicit pin, candidate test, CAS repin, audited rollback |
| Costs | Legacy ledger retained | Exact decimal, unknown nullable, honest completeness |

## Required smoke matrix

PG = actual disposable PostgreSQL and production durable worker/executor.
Artifact = actual local MinIO and production QR/Export handlers.
Usage = PG dispatch/reservation/observation simulation; synthetic costs, no paid AI.
Browser = actual session UI and worker. Unit = focused contract/core regression.

| # | Required behavior | Evidence |
| --- | --- | --- |
| 1 | One key runs two pipelines | PG: distinct grants and deterministic outputs |
| 2 | Ungranted denied | PG: unknown grant run 404 |
| 3 | Other Workspace undisclosed/unrunnable | PG: catalog, grant, create and run checks |
| 4 | No grant-management escalation | PG: default key denied, narrowed scopes cannot expand |
| 5 | Rotation overlap | PG + Browser: both active keys accepted |
| 6 | Revoke old, retain new | PG + Browser: old 401/new 200 |
| 7 | New key reads old run | PG: original run ID returned |
| 8 | Expiry/disable/revoke | PG + Browser; machine-readable errors |
| 9 | Publish leaves PINNED unchanged | PG + Browser: v1 stays while v2 published |
| 10 | Update availability | PG + Browser: latest v2 reported |
| 11 | Draft excluded | Catalog selects immutable publication table; version and capability contract tests; draft capability edit does not publish |
| 12 | Manual repin | PG + Browser: v2 only after explicit operation |
| 13 | Concurrent expectedRevision | PG: one succeeds, other stale 409 |
| 14 | Breaking schema/capability/semantic update | Unit comparisons + PG breaking repin denied; no automatic repin |
| 15 | In-flight pin retention | PG: pause running v1, repin v2, resume → v1 output |
| 16 | Rollback | PG + Browser: audited previous immutable v1 |
| 17 | Checksum mismatch before call | PG: tampered snapshot 409; no added run |
| 18 | Idempotent retry | PG + Browser lost-ACK recovery: same run |
| 19 | Same key/different payload | PG: 409 |
| 20 | Success usage | PG deterministic exact zero + Usage positive synthetic total |
| 21 | Paid failure retained | Usage: failed physical attempt included |
| 22 | Paid cancellation retained | Usage: terminal cancel preserves known total |
| 23 | Retry physical-call identity | Usage: distinct retry counted; duplicate observation not a new call |
| 24 | Late reconciliation | Usage: four observations/three calls, total 0.07000000 |
| 25 | Incomplete is not zero | Unit + Usage: PARTIAL/UNAVAILABLE, nullable exact fields |
| 26 | Budget before dispatch | PG strict unknown bound refused; Usage bound/cap rejection |
| 27 | Concurrent budget reservations | Usage: one admitted, one refused against same locked budget |
| 28 | Artifact owner and declared output | Artifact: own WebP 200; foreign/missing/intermediate QR 404 |
| 29 | Legacy descriptor/run/status/cancel/artifact | Existing v1 smoke + populated-upgrade legacy fixture |
| 30 | Fresh migration | PG: all migrations from empty database |
| 31 | Populated upgrade | PG: exact legacy IDs, hash, run, asset and cost fields retained |
| 32 | Old in-flight completes | PG: old fixture succeeds after additive migration |
| 33 | Two-Workspace isolation | PG: resource queries and execution/read/cancel/artifact denials |
| 34 | One connection / two Content Hub grants | PG: same client/token, separate capability grants |

## Measured evidence

Final migration/cutover run after independent boundary-hardening review:

- Deterministic runs `01a072bc-4b8c-7623-a85e-a68bda02d831` and
  `01a072bc-4bba-7fa4-a4a5-70051e608ac2`, both succeeded at exact zero/zero calls.
- Candidate `01a072bc-515c-7930-ab3c-ddc992feb6ee`; in-flight
  `01a072bc-51d4-72bf-947f-30d88112e10e` retained v1 through repin/rollback.
- Two cross-protocol directions + four concurrent races: max one physical run.
- A v1 credential with a deliberately matching v2 source cannot read, cancel,
  download or replay the v2 run. Explicit mapped ownership marker and legacy
  query filtering prevent source-based fallback from crossing protocol boundaries.
- Simulated accounting: 3 dispatches, 4 observations, USD `0.07000000`.

Final artifact run `01a072bf-5e3b-7534-87cd-31e78811308a`:
QR1024 → WebP512, 11,484 bytes, SHA-256
`ba28631af3840fe936e1855cc64e0f2c8eb11befc3709d19abe23b11d2f39df0`.
Successful authenticated download remains valid after the original publisher's
membership is removed: access belongs to client/Workspace/run, not that user.
Only the four exact fixture original/variant objects (37,587 bytes) were deleted;
the deterministic fixture is reproducible. No user asset was removed.

Browser E2E covers signup on isolated 3314, one-time display and no browser-storage
key persistence, rotate/revoke, disable/enable, deterministic run, lost response
recovery with the same body/key, candidate without changing live pin, repin and
rollback. Desktop/mobile screenshots were visually inspected after hiding keys.
Trace/video/automatic screenshots are disabled for this secret-handling test.

Real HTTP external-consumer rerun passed in 9.3 seconds, without browser cookies:

| Same active credential | Public pipeline | Actual worker run |
| --- | --- | --- |
| Summary grant | `pln_01a072bd8a5c708c9c944ba2e0897343` | `01a072bd-a701-720b-80ca-ce540bae0894` |
| Separate second grant | `pln_01a072bda69c7ee99e532bb4146916c4` | `01a072bd-a70a-759d-8cf0-73406b9c38cd` |

Both runs succeeded, v1 pinned publication, USD `0.00000000`, zero provider calls.
The database confirms the same client and credential; the HTTP test validates
canonical DTOs, complete pinned tuples, correlation, output, cost enforcement and
idempotent replay. These are disposable fixtures, not republished user pipelines.

## Commands and local release status

Baseline: executable 63/63, external v1 4/4, typecheck, lint, architecture and size
were green. Final refreshed results:

| Command / check | Result |
| --- | --- |
| `npm test` | 558/558, zero skipped/failures |
| `npm run test:executable-pipelines` | 98/98 |
| `npm run test:pipeline-external-consumer-smoke` | 4/4 |
| `npm run test:runtime-v2-migrations` | fresh + populated upgrade + v1 + full v2 PG/cutover matrix passed |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3314 npm run test:runtime-v2-external-consumer-smoke` | browser + cookie-free HTTP two-pipeline E2E passed |
| `scripts/runtime-v2-artifact-smoke.ts` with isolated DB + explicit local MinIO | real QR/Export/download/isolation/cleanup passed |
| `npm run typecheck` | passed |
| `npm run lint` | passed, zero warnings |
| `npm run check:architecture` | passed, 1,010 source files |
| `npm run check:size` | passed, 782 implementation files |
| `npm run db:check` | passed |
| `npm run build` | passed after final source edits |
| Stable Compose web image build | passed; same image used for web, both workers and migration |
| `git diff --check` | passed |
| Tracked/untracked source secret-pattern scan | no GitHub or actual runtime credentials found |

The independent audit additionally closed CLI destination path/symlink bypasses
with four real filesystem tests and aligned OpenAPI uniqueness/field-count bounds
with canonical validators. No secret value was included in tool output.

Reproducible gates: `npm test`, `npm run test:executable-pipelines`,
`npm run test:pipeline-external-consumer-smoke`, `npm run test:runtime-v2-migrations`,
`npm run typecheck`, `npm run lint`, `npm run check:architecture`,
`npm run check:size`, `npm run db:check`, `npm run build`.
The migration runner refuses existing test DBs, creates only named disposable
local databases and drops only its own databases without terminating sessions.

Local migration/replacement completed on the existing Compose project
`image-prodaction`; all three application services are healthy. The same stable
image `sha256:bbc26119edd26be9e3b81b4dde6775b175247eb5cfaa92ef8eae87ccf4ccc0f6`
is used by web, generation worker and pipeline worker. Migration completed on the
preceding build `3ff26cf179b6…`; the final build only clarified UI budget wording,
without another schema change. Its standard Compose migration container remains
exited successfully, not a leaked one-off test container.
Previous service images were retained; no image/volume/database prune was run.
The integration network still contains only `ludimogut-api` and
`image-prodaction-web-1`; Content Hub was not restarted or modified.

Direct `127.0.0.1:3004` and proxy `127.0.0.1:7310` both return ready/healthy for
database, storage and both workers. OpenAPI v2 is 200, unauthenticated v2 client
and existing v1 descriptor requests are 401. Worker advertises `[1,2]` support.
The product screen is `/settings/integrations` on the existing local origin.

Live before/after counts are identical: 25 pipeline runs, 80 generation jobs,
967 assets, 4 legacy consumers, 7 legacy keys, 17 pipeline versions. No live
service client, new key or grant was created for the user. One pre-existing
unqueued short-text record from July 31 remains untouched (`enqueued_at=null`);
there were no active executing jobs to interrupt during replacement.

Before migration a mode-0600 PostgreSQL custom-format backup was created at
`/tmp/image-runtime-v2-backup.75sgan/image_prodaction-before-runtime-v2.dump`
(1,445,149 bytes); `pg_restore --list` verified readability. It is retained as a
temporary local rollback aid, contains private project data, and must not be
committed/shared. This is a database backup, not a second repository/worktree.
The two exact task-owned test databases were dropped after browser/artifact
verification; test processes stopped and only fixture S3 objects were removed.
Docker cache/disk accounting: no active build or test-preview process remains.
Two completed-build cache cleanups reclaimed 1.798 GB each according to Docker;
the final cleanup changed measured free space from about 50 to 51 GiB. Earlier
npm cache cleanup removed about 468 MB but did not produce a net host-space gain
while other work was active. Current free space is about 51 GiB, still below the
project's 15% threshold; no further broad cleanup was attempted. Final Docker
inventory: 74 images / 42.97 GB, 29 containers, 38 volumes / 2.932 GB, build cache
34.3 MB. Before these builds: 73 images / 39.45 GB and the same 29 containers;
other host work was also running, so host-wide deltas are not all attributed to
this task. Both recent application builds and previous service images are retained
for rollback; no images, volumes, user files or live database were deleted.

## Residual boundaries and next action

- No real paid AI call, 20-run product gate, load test, production deploy or public
  SDK release. Current real providers do not guarantee an upper call-price bound:
  STRICT blocks them; explicit BEST_EFFORT can overspend. Do not promise otherwise.
- Existing Content Hub remains v1. A new key alone cannot upgrade its strict DTOs.
  Implement the [separate consumer handoff](content-hub-runtime-v2-handoff.md).
- Dependency audit remains non-green: 4 moderate findings in the existing
  drizzle-kit/esbuild development chain and 1 high in `fast-uri@3.1.5` via
  ChatModule → AJV. No exploitable outgoing URL-fetch path was established by
  the narrow source review; this is not a security clearance. The image includes
  full node_modules, so those packages are present. `package-lock.json` is
  unchanged from HEAD; no automatic dependency upgrade/audit fix was performed.
  Address in a separate dependency/consumer-check change before production.
- Runtime API v2 heartbeat is required before admission; do not mix old workers
  with v2 intake. Drain/retain v2-capable workers for rollback; preserve history.
- Two task-owned smoke databases and task-owned assets are temporary. Historical
  run IDs above are evidence references after cleanup, not live product runs.
- Repository changes are local/uncommitted. No Notion edit has been made. A narrow
  product-card technical status update can be proposed with this report only after
  final verification and explicit user approval.
