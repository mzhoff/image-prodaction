# Content Hub → Image Production Runtime v2: handoff

Date: 2026-09-05. This document describes implemented Image Production contracts,
not a completed Content Hub migration. No Content Hub source, database or storage
is modified by the Image Production task. Local verification is not a production
release, and no paid provider run is authorized by this handoff.

## Product connection flow

1. In Image Production open Settings → Integrations → Подключения as a Workspace
   owner/admin. Create an application connection, for example Content Hub, using
   `sourceApplication=content-hub` and the consumer's opaque Workspace ID.
2. Choose only required permissions. Issue a credential. Copy it once into the
   consumer's server-side encrypted connection settings. Do not put it in URLs,
   prompts, screenshots, browser storage, mobile bundles or logs.
3. Allow each published pipeline separately, selecting its pinned version and
   reviewing its input/output contract. A single credential can use both grants.
4. Test a deterministic pipeline first. The Settings test uses the administrator's
   session; it does not mint a hidden server credential. External consumer E2E must
   additionally exercise the issued credential from the Content Hub server.
5. For rotation issue a second key, update the consumer, prove access to an existing
   run and both grants, then revoke the old key. At most two active keys overlap.

The client belongs to the Image Production Workspace. The external Workspace
reference is a correlation value, not permission to access another Workspace.
Identity and membership remain separate between products in this iteration.

The two existing pilot publications were checked locally:

| Intended capability | Public ID | Existing publication |
| --- | --- | --- |
| `content.generate-article-summary` | `pln_019fb9e98e757364b4c34ca908554584` | v6, capability not yet set |
| `brand.generate-article-cover` | `pln_019fd2598f1e7976b0c3f36a36509dd7` | v5, capability not yet set |

These IDs are pilot configuration, never universal Runtime constants. In the
canvas, right-click the pipeline section → Integration capability, choose the
appropriate key, then Publish executable version. This creates a new immutable
publication; existing v5/v6 and their v1 consumers are not rewritten. The user
must review and publish these drafts; the implementation does not do it silently.

## Transport and canonical contracts

Base: `/v2/runtime`. OpenAPI: `GET /v2/runtime/openapi.json` (no credential).
All other external routes use `Authorization: Bearer <server-only rvr_client key>`.
Requests and responses are JSON except artifact downloads. Responses are private
and no-store. The authoritative validators and inferred TypeScript types are in
`src/modules/executable-pipelines/contracts/runtime-v2-*.ts` and
`runtime-usage-contracts.ts`; OpenAPI is generated from those same validators.
Do not maintain a second handwritten strict DTO that drifts from these contracts.

| Route | Permission | Envelope |
| --- | --- | --- |
| `GET /client` | active credential | `{client}` |
| `GET /pipelines` | `pipeline.catalog.read` | `{pipelines}` |
| `GET /pipelines/:publicId/versions` | `pipeline.catalog.read` | `{versions}` |
| `GET /pipelines/:publicId/versions/:version` | `pipeline.catalog.read` | `{descriptor}` |
| `GET /grants` | `pipeline.descriptor.read` | `{grants}` |
| `GET /grants/:grantId` | `pipeline.descriptor.read` | `{grant}` |
| `GET /grants/:grantId/updates` | `pipeline.descriptor.read` | `{updates}` |
| `POST /grants` | explicit `pipeline.grants.manage` | `{grant}`, 201 |
| `PATCH /grants/:grantId` | explicit `pipeline.grants.manage` | `{grant}` |
| `POST /grants/:grantId/repin` or `/rollback` | explicit `pipeline.grants.manage` | `{grant}` |
| `POST /grants/:grantId/runs` | `pipeline.run.create` | run directly, 202 |
| `GET /runs/:runId` | `pipeline.run.read` | run directly |
| `POST /runs/:runId/cancel` | `pipeline.run.cancel` | run directly |
| `GET /runs/:runId/artifacts/:assetId` | `pipeline.artifact.read` | authenticated bytes |

Default credentials omit grant management. Prefer administrator-managed grants
for the pilot. A consumer cannot escalate its scopes or create grants merely
because it can execute a permitted pipeline.

### Administrative CLI fallback

Prefer Settings for normal use. CLI runs on the Image Production server with its
database configuration and rechecks the specified user's current owner/admin
membership. It is not an external client endpoint or identity impersonation API.
All invocations start with `npm run runtime:connections -- <operation>` and
require `--user <existing-user-id> --workspace <workspace-uuid>`.

| Operation | Additional options |
| --- | --- |
| `create-client` | `--request-file <JSON with displayName/sourceApplication/externalWorkspaceRef/scopes>` |
| `list` | none |
| `issue` / `rotate` | `--client <uuid> --token-file <new path outside repo> --label <label>`; optional `--request-file` with label/scopes/expiresAt |
| `revoke-credential` | `--client <uuid> --credential <uuid>` |
| `disable-client` / `revoke-client` / `enable-client` | `--client <uuid>` |
| `grant` | `--client <uuid> --request-file <grant request JSON>` |
| `inspect-grant` | `--grant <uuid>` |
| `repin` / `rollback` | `--grant <uuid> --request-file <repin request JSON>` |
| `disable-grant` / `revoke-grant` / `enable-grant` | `--grant <uuid> --revision <expected revision>` |

The secret file must not exist, its parent must already exist outside the real
repository path, and aliases/symlink parents into the repository are rejected.
It is created exclusively with mode 0600; only credential metadata and the file
path go to stdout. A failed delivery revokes the newly issued credential and
removes only the newly created file. `rotate` issues an overlapping key; it does
not revoke the old key before the consumer has switched. `revoke-client` and
`revoke-grant` are disable aliases, not destructive deletion of audit/history.

## Consumer data model and implementation

Implement separately in Content Hub, using its contracts/core/adapters boundaries:

- Workspace-level `ImageProductionConnection`: server-only encrypted credential,
  base URL, external client ID, status, last validation, rotation metadata. Move
  the secret out of individual bindings; retain legacy encrypted keys until v1
  history/cutover has been verified. Do not merge identities or databases.
- One `CapabilityBinding` per product function: connection ID, grant ID, publicId,
  capability key, pinned version, grant revision, pipeline/input/output checksums
  and the exact contract snapshot. A candidate gets a separate binding/grant.
- External operation: original protocol/connection/binding, durable business
  operation ID, Idempotency-Key, immutable request fingerprint, run ID, correlation,
  status, returned version/checksums, usage/cost snapshot and imported artifact IDs.
- `ContentProductionSession`: group related attempts and accepted/rejected results;
  link Publication and channel on the consumer side. Pass only opaque references
  to Image Production; it does not adopt those editorial domain entities.
- Persist all failed, canceled and retried operation costs. Gross production cost
  includes all known production spend. Accepted-result cost must include the
  session's attempts needed to obtain an accepted result, with an explicit
  denominator. Display incomplete cost separately; unknown is not zero.

Keep transport in a server adapter. The browser never calls Runtime with a key.
Put consumer IDs, prefixes, checksums and grant revisions in expandable diagnostics.
No public SDK, shared Identity, pricing, credits or billing extraction is required.

## Run protocol and idempotency

Example body (field names inside `input` come from the pinned descriptor):

```json
{
  "input": { "articleSummary": "Краткое содержание статьи для иллюстрации" },
  "expectedGrantRevision": 1,
  "correlationId": "operation-opaque-id",
  "consumerReference": { "publicationId": "publication-opaque-id" },
  "maximumProviderCostUsd": "0.05000000"
}
```

Send a stable, non-secret `Idempotency-Key` for the business operation. On a network
timeout, repeat the identical request with the same key; never create a fresh key
to resolve an uncertain outcome. Idempotency scope is client + grant + key, not
credential. Rotation and repin do not change an already accepted run. Changed
payload with the same key returns 409. Store the returned run ID before polling.

The run response contains `id`, `serviceClientId`, `grantId`, `grantRevision`,
`pipeline` (publicId/version/capability/checksums), `status`, `outputs`, `attemptCount`, `maxAttempts`,
`idempotentReplay`, `correlationId`, `consumerReference`, `cost`, `usage`, `error`,
timestamps and `statusUrl`. Validate against the canonical schema. Poll the same
run through terminal status, with bounded backoff; usage may reconcile later.
Run creation never accepts draft nodes or consumer-supplied provider estimates.

## Versions, repin and rollback

`updates` reports pinned/latest publications, update availability, grant revision,
compatibility and previously pinned rollback versions. A draft is never latest.
Publish does not change a PINNED grant. Equal input/output schemas do not prove
equal behavior, quality or cost. Unknown cost/behavior evidence blocks automatic
repin in this release, including stored non-PINNED opt-in policies.

Fetch the candidate descriptor, validate its exact input/output contracts, create
a separate candidate grant, and test it. Only after review send repin with:

```json
{
  "expectedGrantRevision": 1,
  "version": 2,
  "checksum": "<candidate pipeline checksum>",
  "inputSchemaChecksum": "<candidate input checksum>",
  "outputSchemaChecksum": "<candidate output checksum>"
}
```

All checksum placeholders are copied from the descriptor, not calculated from
display text. Refresh after a stale revision; never blindly overwrite a newer
binding. Rollback has the same body shape and selects a previously pinned version.
Accepted in-flight runs finish against their original immutable snapshot.

## Cost, artifacts and errors

Read [cost semantics](runtime-v2-cost-semantics.md). Money is an exact USD decimal
string; token counts are nullable integer strings. `PENDING`, `PARTIAL`,
`COMPLETE`, `UNAVAILABLE` describe usage separately from execution status.
Failed/canceled work can have a positive complete cost. Reconciliation revises
an observation of one physical call, not another charged call.

The strictest request/grant cap applies. Current paid providers cannot offer a
trusted per-call upper bound: STRICT refuses before paid dispatch. Explicit
BEST_EFFORT reports UNSUPPORTED enforcement and may overspend. The UI must not
describe it as guaranteed or manufacture an estimate. Deterministic execution
can honestly report zero and ENFORCED. No paid smoke is part of this release.

Download only declared output artifacts through the returned protected v2 route,
with the same active client's credential. Check Content-Type, byte length, SHA-256
and dimensions against the declared contract before importing into the consumer's
own Workspace-scoped storage. No direct Image Production database/MinIO access,
cross-service browser token forwarding, or internal storage URL is needed.

Errors use `{error:{code,message}}`. Act on `code`, not English text:

| Codes | Consumer action |
| --- | --- |
| `invalid_credential`, `expired_credential`, `revoked_credential` | Reconnect/rotate; do not retry generation with another business key. |
| `disabled_service_client`, `missing_scope`, `scope_escalation` | Ask Workspace administrator; do not broaden scopes automatically. |
| `service_client_not_found`, `grant_not_found`, `pipeline_not_found`, `run_not_found`, `not_found` | Treat as unavailable; foreign Workspace resources deliberately look missing. |
| `disabled_grant`, `grant_disabled`, `pipeline_disabled` | Stop new intake for that binding. |
| `pinned_version_unavailable`, `capability_mismatch`, `contract_checksum_mismatch`, `incompatible_repin` | Refresh/review descriptor; no silent substitute version. |
| `stale_grant_revision`, `rollback_version_unavailable` | Reload binding/history and request explicit selection. |
| `invalid_request`, `invalid_input`, `invalid_idempotency_key`, `request_too_large` | Correct the local request contract. |
| `idempotency_conflict`, `idempotency_protocol_conflict` | Recover original operation/protocol; never generate a new key just to bypass 409. |
| `cost_estimate_unavailable`, `cost_limit_exceeded`, `cost_enforcement_unsupported` | Explain budget/support boundary; weaker policy requires explicit consent. |
| `worker_unavailable`, `runtime_unavailable` | Bounded retry of the identical original request. |
| `artifact_not_ready`, `artifact_not_found` | Poll readiness or report unavailable; no direct storage fallback. |
| `cancellation_race` | Refresh final status; completion may have won the race. |
| `connection_exists`, `rotation_overlap_limit`, `invalid_expiry`, `credential_not_found`, `update_policy_disabled` | Resolve management state in Settings. |

Unknown codes remain safe user-visible errors, not automatic paid retries. Routes
and their tests are authoritative for exact HTTP status and code combinations.

Revoke immediately removes that credential's access, not historical data or costs.
Disable-client blocks all external access. Disable-grant blocks new runs but
retains authorized history. Queued/running work is not silently erased or refunded;
use explicit cancellation. The remaining active key of a client can read its
earlier runs. Session administrators retain management access.

## Local network and migration runbook

For the current single-machine topology use the existing external Docker network
`prodaction-services-local`, web alias `image-production-api`, internal port 3000.
Configure Content Hub server base URL `http://image-production-api:3000`; browser
URLs remain host-facing. Publish neither databases nor provider keys to the public
internet. A future separate host changes transport/TLS/access controls, not the
grant/run contract. A provider egress proxy is a separate approved task.

1. Deploy additive migration 0024 with backups and validated empty/new/upgrade
   database tests. Preserve all v1 IDs, keys, runs, usage and assets.
2. Update worker and web coherently. Do not mix pre-v2 workers with v2 intake.
   Admission requires a recent worker heartbeat advertising Runtime v2.
3. Create client, issue one credential, publish capability-enabled versions, create
   both grants, validate descriptors and run two deterministic consumer tests.
4. In a separate Content Hub task add v2 connection/binding models and adapter.
   Route only new business operations to v2. Keep in-flight and retried v1
   operations on v1 with their original keys and run IDs until drained.
5. The database rejects the same pipeline/Workspace/idempotency key crossing v1
   and v2 with 409, including a race. This guard prevents a second physical run;
   it does not adopt legacy ownership or map different consumer business keys.
6. Verify old v1 runs/artifacts and new v2 history. Revoke legacy keys only with a
   separate explicit owner operation, never as an automatic migration side effect.
7. Roll back the consumer by selecting v1 for new operations while retaining v2
   routes/credentials and a v2-capable worker for its existing operations. Drain
   v2 before binary rollback; retain additive tables/history. Do not run a reverse
   destructive migration or submit accepted work again under a different protocol.

## Consumer acceptance checklist

- One encrypted Workspace connection, two separate capability bindings, one key.
- Real server-to-server deterministic text and image result import; no mocks at
  the authentication, database, worker or artifact transport boundary.
- Tenant isolation, narrowed scopes, rotation overlap, revoke and old-run access.
- Stable same-key timeout retry, changed-payload 409, original-protocol v1 retries.
- Publication discovery, candidate validation, explicit repin, stale-revision 409,
  in-flight pin retention and explicit rollback.
- Positive simulated paid failure/cancel/retry costs; late reconciliation replaces
  observations; incomplete values stay incomplete. No paid calls without consent.
- No raw key in browser logs/storage, request telemetry, error reports or source.
- Editorial session links remain in Content Hub, artifacts imported into its own
  storage, v1 compatibility checked before any legacy credential revocation.
