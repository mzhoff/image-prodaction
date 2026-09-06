# Runtime workspace connections v2

Status: implemented and locally verified, approved scope 2026-09-05. Local only;
no paid provider calls, production deployment, shared Identity migration or
Content Hub changes are authorized by this implementation.

## Decision

One Image Production Workspace owns one logical connection for each pair of
source application and opaque consumer Workspace reference. A connection owns
rotatable credentials and independently pinned pipeline grants. A credential
is not a pipeline binding. Image Production owns execution and provider cost;
Content Hub continues to own editorial workflow, publishing and retail pricing.

Runtime v2 has a separate `/v2/runtime` boundary. V1 response shapes and
`rvr_pipe_*` authentication remain unchanged: the existing Content Hub consumer
uses strict validation. `rvr_client_*` credentials only authenticate v2.
Zod schemas are the canonical external contract; TypeScript is inferred and
OpenAPI is generated from those schemas, not maintained as a parallel DTO.

The first release includes Settings → Integrations: create connection, choose
permissions, issue a key once, grant pipelines, inspect updates, explicitly
repin/rollback, rotate and revoke. The raw credential is held transiently in
the issue response and browser memory only. It is never returned by list/read,
stored in localStorage, logged, or persisted unhashed on the server. CLI output
uses exclusive creation of a new mode-0600 file, never stdout.

## Security and lifecycle

Session management verifies current Workspace owner/admin membership on every
request; a Workspace ID selected in the browser is not authority. External
grant management additionally needs `pipeline.grants.manage` and the connection's
explicit self-management policy. It cannot increase connection/credential
scopes. Cross-Workspace targets are indistinguishable from missing resources.

Revoked/expired keys and disabled/revoked clients lose external access at once.
Disabling a grant blocks new execution. Historical runs, usage and artifacts
are retained; revocation does not erase or automatically cancel queued/running
work. Cancellation is an explicit operation. Another active credential of the
same client can access that client's v2 history, subject to scopes/ownership.
An administrator retains management access through the product session.

Run creation rechecks live authentication, permission, grant revision and pins
under database locks. The run stores immutable version/checksum/capability,
caller, grant and cost-policy snapshots. Repin cannot alter an in-flight run.
Idempotency belongs to `(client, grant, key)`, not a credential. The fingerprint
covers the original validated request; an identical replay after rotation or
repin returns its original run, while a changed request conflicts before work.

## Versions and migration

Only published immutable versions participate in discovery. `PINNED` is the
default and publication never silently changes a grant. Schema equality is not
proof of equivalent output quality or cost. Unknown behavior/cost evidence
disallows automatic updates. Manual repin/rollback uses expected revision and
an audit trail. Testing a candidate uses a separate grant, not a mutation of
the production binding or a draft override.

Migrations add tables and nullable run/usage attribution. Legacy names, values,
consumer IDs, keys and history remain. V2's internal source namespace is separate
from the public source application, preserving the legacy unique key and its
existing consumers. Cutover must keep every in-flight/retried v1 operation on
its original protocol and credential until drained; it must not resubmit the
same business operation as a fresh v2 generation. Revocation of legacy keys is
a later explicit owner action, not part of schema migration. An additive database
trigger serializes a Workspace/pipeline/idempotency key and rejects an opposite-
protocol insert with `idempotency_protocol_conflict`, including concurrent
cutover attempts. It never adopts a legacy run into a different caller's history.

V2 admission requires a recent worker heartbeat advertising Runtime v2. Roll out
web and workers coherently: pre-v2 workers must not consume the v2 queue. For a
binary rollback first stop v2 intake and drain or retain v2-capable workers for
already accepted v2 runs. Keep additive tables and historical observations.

## Cost is not billing

Money is an exact decimal string; unknown is null, not zero. Physical calls,
including retries and paid failures/cancellation, are counted once. Pricing
reconciliation revises a call observation rather than creating a new call.
Usage states are PENDING, PARTIAL, COMPLETE and UNAVAILABLE, independent of the
execution status. COMPLETE requires complete provider cost for all calls.
Historical provider observations are not repriced using today's rates.

The effective cap is the strictest request/grant cap. A hard guarantee requires
a trusted upper bound before every paid dispatch and atomic reservation. Current
providers without such a bound are explicitly UNSUPPORTED; STRICT fails closed
before a paid call. BEST_EFFORT must be an explicit weaker policy and must not
claim a hard guarantee. Deterministic execution can truthfully report zero and
ENFORCED. No caller-supplied estimate is trusted as a provider upper bound.

## Verification and release boundary

Baseline: branch `codex/stories-contract-presets`, HEAD
`ce07804be92bc8d38b5e30ea85e6cc5aa42b90df`, prior same-task Input/Export/node-help
changes preserved (38 tracked + 10 untracked paths). No new branch, stash,
worktree or checkpoint commit is created over those changes.

Before v2 edits: executable tests 63/63; external v1 consumer tests 4/4;
typecheck, lint, architecture and size checks passed. Final verification must
separately prove PostgreSQL fresh/upgrade migrations, two Workspace isolation,
one credential/two grants/two deterministic worker runs, rotation/revoke,
version discovery/repin/rollback, honest usage and cost guard behavior.
No production-readiness claim follows from local checks alone. See the
[Content Hub handoff](content-hub-runtime-v2-handoff.md) for the separate consumer
migration and rollback protocol, and the [verification report](runtime-v2-verification-2026-09-05.md)
for measured local results.
