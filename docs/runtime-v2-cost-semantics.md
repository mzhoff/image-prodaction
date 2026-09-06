# Runtime v2: provider cost and usage

Runtime reports production cost charged by the generation provider. It does
not calculate a Content Hub tariff, subscription, credits, revenue, or marketing
metrics. This contract applies to `/v2`; v1 response shapes remain unchanged.

## Monetary values and completeness

USD values are decimal strings with eight fractional digits of ledger precision.
Cap comparisons, addition and reservation arithmetic use integer 10^-8 USD units,
not JavaScript floating-point arithmetic. Provider observations are normalized
once to this precision. Historical events never use today's model price.

`null` means unknown. Missing cost is never converted to zero. A completed
deterministic pipeline that made no provider call has cost `"0.00000000"` and
`providerCallCount: 0`. An explicit provider-reported zero is also preserved as
known data; this is different from assuming that an unpriced call was free.
A positive amount too small to survive ledger precision is unknown rather than
zero. Provider amounts with more than eight fractional digits are rounded once
using decimal arithmetic; a price snapshot is not re-priced on later reads.

The usage object contains:

- `state`: `PENDING | PARTIAL | COMPLETE | UNAVAILABLE`;
- `currency`: `USD`;
- nullable `inputTokens`, `outputTokens`, `totalTokens` as integer strings;
- `actualProviderCostUsd`: total for all observed dispatched calls only when all
  of those calls have a known price; otherwise null;
- `knownProviderCostUsd`: the known subtotal, or null when no price is known;
- `estimatedProviderCostUsd`: an estimate snapshot or null;
- `providerCallCount` and `pricedCallCount`.

While execution is running, the observed cost may grow. Consumers must check
both execution status and usage state before calling a number the final cost.
Token counts have their own completeness: a token total is null when any call's
corresponding count is unknown, even if all monetary costs are known.

| Usage state | Meaning |
| --- | --- |
| `PENDING` | No priced subtotal yet; execution or recoverable usage is pending. |
| `PARTIAL` | A priced subtotal exists but execution or another call's price is incomplete. |
| `COMPLETE` | Execution is terminal and every dispatched call is priced, or deterministic zero is proven. |
| `UNAVAILABLE` | Execution is terminal and no price can currently be reconciled. This is not zero. |

A failed or canceled run can have `COMPLETE` usage and a positive cost. Failure
and cancellation do not refund calls that the provider has already accepted.

## Calls, attempts and observations

The physical dispatch identity is `generationJobId + attemptCount`.
`usage_event.callIndex` is an observation revision for that identity. An initial
result and later provider reconciliation can produce two events for one call;
the latest observation is used, not the sum of both observations.

Structured-output repair creates a separate generation job. Image retries have
separate dispatch attempts. Both count toward cost. Idempotent result replay,
checkpoint restoration and provider-status lookups do not create new generation
dispatches or duplicate cost.

Dispatch intent is durably recorded immediately before invoking the provider.
When a process or network fails at that boundary, the exact upstream outcome
may be unknowable. That attempt remains an unpriced dispatch until reconciled;
its existence is not evidence that the provider charged money. A checkpoint is
reused without a new dispatch, and an uncertain accepted call is not blindly
repeated.

New v2 generation jobs and usage observations have normalized nullable links:

- `pipelineRunId` and `pipelineNodeRunId`;
- `serviceClientId` and `grantId`;
- `capabilityKey`;
- existing `generationJobId`, provider, model, operation and attempt.

The production handler obtains these links from the server-owned run and active
node run. Missing v2 attribution fails closed. Public generation input cannot
provide this attribution. Legacy rows retain null links and their original
history; no continuous arbitrary metadata extraction is used for v2 accounting.

Every usage write refreshes the generation-job projection and v2 run aggregate.
Terminal run transitions and v2 status reads also refresh the run. A late price
therefore updates a failed, canceled or succeeded run without executing it again.

Automatic OpenRouter reconciliation examines the latest observation for every
eligible attempt, including rows with complete tokens but missing cost. It
retains already-known fields and appends only newly known data. The automatic
window is 24 hours after generation-job completion; a status read exposes
unrecoverable/no-longer-eligible missing cost as unavailable or partial. This
window is an operational retry boundary, not proof that an unknown charge is
zero or an immutable statement that the provider can never supply information.

## Cost policies and current support

Each run snapshots request cap, grant cap, their minimum effective cap, policy
mode, enforcement level, estimate and pricing snapshot. A repin or later grant
policy change cannot change a run's cost snapshot.

| Pipeline / policy | Current behavior |
| --- | --- |
| Known deterministic handlers, `STRICT` | Proven zero estimate; `ENFORCED`. |
| Paid OpenRouter handlers, `STRICT` | Rejected before enqueue/provider dispatch because a guaranteed per-call USD upper bound is unavailable. |
| Paid OpenRouter handlers, explicit `BEST_EFFORT` | `UNSUPPORTED`; known spent/reserved amounts are checked but no hard total-price guarantee is claimed. |
| A future server adapter with a trusted upper bound | Reservation code can enforce its bound atomically; currently exercised only with synthetic test bounds. |

`ESTIMATED` is an available contract value for a future qualified estimate; no
production model price or estimate is fabricated. Client payloads and node
configuration cannot supply a trusted provider bound.

For each paid dispatch and retry, the worker locks the run, checks its and the
generation job's active lease/cancellation state, and checks spent money plus
outstanding reservations plus the next trusted bound. Dispatch marker and
reservation commit atomically. Sibling nodes serialize through the same run-row
lock. Settlement takes that lock before refreshing the job to maintain the same
lock order. A duplicate dispatch identity is refused.

The reservation table is transient execution control, not another billing
ledger. Actual append-only observations remain in `usage_event`. An unknown
settlement retains its reservation; it is not released as zero. In best-effort
mode an unbounded call can exceed a configured cap after dispatch, and concurrent
unbounded calls cannot be promised a shared hard ceiling. Production OpenRouter
strict mode therefore remains blocked.

Stable errors are `cost_estimate_unavailable`, `cost_limit_exceeded`, and
`cost_enforcement_unsupported`. Rejection before dispatch creates no usage event.

## Verification

Focused unit tests cover exact decimal arithmetic, strictest cap, deterministic
zero, unsupported strict dispatch, spent-plus-reserved checks, paid terminal
outcomes, repair/retry identities, observation deduplication, late price,
partial/unavailable values, and unchanged reconciliation responses.

`testing/runtime-usage-smoke.ts` runs against a dedicated PostgreSQL smoke
fixture. Two concurrent trusted synthetic reservations admit one call and refuse
the other. It then proves three simulated dispatches/four observations aggregate
to `"0.07000000"`, including a paid failed attempt, a retry and a late price.
Success, failure and cancellation preserve that total and normalized linkage.
The fixture performs no paid provider request; those dollar values are synthetic.

The root Runtime smoke additionally verifies v1 compatibility and Workspace
isolation. Binary rollback must stop v2 intake and drain/retain a v2-capable
worker for its already accepted runs; a pre-v2 worker cannot supply the new
per-dispatch budget and attribution behavior.
