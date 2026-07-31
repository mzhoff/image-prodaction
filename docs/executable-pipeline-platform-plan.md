# Executable Pipeline Platform: context and iteration plan

Date: 2026-07-31

Status: accepted product direction and implementation plan

Working branch: `codex/executable-pipeline-runtime`

## 1. Decision

Image Production is not a complete marketing-management system and should not
absorb LMS, Content Ops, calendar, approval, student-management, or chat-product
responsibilities.

Image Production has two product responsibilities:

1. `Pipeline Studio`
   - visually create and edit workflows;
   - test nodes and connections;
   - declare typed inputs and outputs;
   - publish an immutable executable version;
   - inspect structure, runs, artifacts, and technical diagnostics.
2. `Pipeline Runtime`
   - accept a typed execution request;
   - resolve a published pipeline version;
   - queue and execute the compiled graph;
   - store run and node-run state;
   - return typed artifacts;
   - measure latency, throughput, failures, retries, and provider cost.

Content Ops, LMS, and ChatModule are independent product consumers. They own
their user workflows and business metrics, and call Pipeline Runtime through a
stable contract.

## 2. Ecosystem roles

```text
Account Platform
  one identity subject and product entitlements

Image Production / Pipeline Studio
  author, test, publish, inspect

Executable Pipeline Core
  contracts, compiler, version registry, queue, executor, run ledger

Content Ops / Reverie
  content plan, campaign workflow, approval, publishing, marketing outcomes

LMS / Course Factory
  courses, lessons, assignments, review, course versions, learning outcomes

ChatModule
  product help, structured interaction, allowed capability invocation,
  run progress and result presentation
```

The final public names `Reverie`, `Revery`, and `Content Ops` are not fixed by
this document. They must not leak into core domain contracts.

## 3. Logical boundary now, physical extraction later

The first pilot stays in this repository and reuses the current PostgreSQL,
object storage, provider adapters, and worker deployment.

The runtime must nevertheless be implemented as an extractable backend module:

```text
src/modules/executable-pipelines/
  contracts/   public types, DTOs, events, error taxonomy
  core/        compiler, state machines, execution rules
  server/      application services and worker composition
  adapters/    PostgreSQL, object storage, provider/node handlers
  testing/     fakes and in-memory adapters
```

Dependency direction:

```text
app/API/worker composition
  -> server
    -> core
      -> contracts

adapters implement ports declared by contracts/core
```

`core` and `contracts` must not import:

- Next.js;
- environment variables;
- PostgreSQL or Drizzle;
- S3;
- OpenRouter;
- Content Ops, LMS, or ChatModule types;
- browser or canvas UI code.

Extraction into a separate package, repository, database, or service happens
only after at least two real consumers, independent release pressure, or
runtime scaling/security requirements justify the DevOps cost.

## 4. Consumer contract

Consumers call a semantic capability, not a canvas node and not an unversioned
document:

```text
content.plan.generate
content.post.generate
course.outline.generate
lesson.draft.generate
assessment.rubric.generate
course.cover.generate
assistant.product_action.execute
```

A consumer-side binding maps the stable capability to a published pipeline:

```text
capabilityKey
pipelinePublicId
pinnedVersion
inputSchemaChecksum
outputSchemaChecksum
configuration
status
```

This allows a pipeline to be updated, disabled, rolled back, or replaced
without migrating the consumer's domain data.

## 5. Runtime API target

```http
POST /v1/pipelines/{publicId}/runs
GET  /v1/runs/{runId}
POST /v1/runs/{runId}/cancel
GET  /v1/runs/{runId}/artifacts
```

The first production consumer uses service-to-service authentication and an
`Idempotency-Key`. Long operations return `202` with `runId`; polling is the
first delivery mechanism. Signed webhooks follow after the persisted run
foundation is proven.

Published pipeline versions are immutable. Editing a canvas document never
changes a running endpoint silently.

## 6. Runtime and business observability

Pipeline Runtime owns technical metrics:

- queued/running counts;
- queue wait;
- p50/p95 run duration;
- node duration;
- success/failure/cancel rate;
- retries and lease loss;
- duplicate suppression;
- provider usage and cost;
- artifact retention.

Consumer products own business metrics:

- Content Ops: time to approved post, revision count, publication outcome;
- LMS: time to approved module, factual/methodical corrections, published use;
- ChatModule: task completion, confirmation, handoff, user outcome.

Technical success must not be reported as business value.

## 7. ChatModule role

ChatModule is a consumer and interaction layer, not another pipeline engine.

It has two separate modes:

1. Help mode
   - explain the product;
   - search documentation and contextual knowledge;
   - answer without starting a paid or mutating operation.
2. Action mode
   - resolve an allowed capability from ProductProfile/RuntimeContext;
   - collect typed input;
   - request explicit confirmation when the action is paid, publishing, or
     otherwise consequential;
   - start a run;
   - show progress and typed result blocks.

Only repeatable, long-running, expensive, auditable, or multi-step actions
should become executable pipelines. A simple chat answer does not need a
durable pipeline run.

## 8. Synergy pilot positioning

Do not sell a generic ecosystem or pipeline builder as the first pilot.
Select one vertical outcome:

### Marketing

```text
approved brief
  -> content plan
  -> posts and visual variants
  -> human review
  -> approved export/publication package
```

### Education

```text
approved sources and learning goals
  -> course outline
  -> lesson drafts, assignments, rubric
  -> cover and short voiceover
  -> methodist review
  -> approved course package
```

The shared runtime is the technical advantage and scale story, not the pilot's
user-facing scope. Game24 can be the first internal education consumer and
evidence case.

## 9. First implementation iteration

Goal: prove an extractable runtime domain before adding public UI or
product-specific integrations.

### Slice A — contracts and compiler

- public pipeline definition and run contracts;
- stable error taxonomy;
- validation of node ids, dependencies, declared inputs and outputs;
- deterministic topological execution levels;
- explicit handler type and handler version;
- rejection of cycles and unsupported definitions.

### Slice B — executor

- handler registry behind a port;
- execution by topological level;
- parallel execution inside one safe level;
- typed input resolution;
- per-node result and failure information;
- cancellation through `AbortSignal`;
- no direct provider dependency in core.

### Slice C — run state and queue port

- idempotent run creation contract;
- run statuses and allowed transitions;
- claim, lease, heartbeat, cancel, success, and failure;
- bounded retries;
- worker that cannot commit after lease loss;
- in-memory adapter and deterministic tests first.

### Slice D — persistent adapter

- `executable_pipeline`;
- immutable `pipeline_version`;
- `pipeline_endpoint`;
- `pipeline_run`;
- `pipeline_node_run`;
- PostgreSQL `FOR UPDATE SKIP LOCKED` queue adapter;
- request/result payload references in object storage;
- migration and persistence smoke test.

### Slice E — first API and consumer

- publish one code-configured/test pipeline;
- `POST run`, `GET status`, `cancel`, and `artifacts`;
- one service account;
- polling;
- one Content Ops or LMS adapter;
- one real end-to-end run with cost and latency evidence.

## 10. Explicitly deferred

- separate repository or database;
- public marketplace;
- user-defined JavaScript or containers;
- scheduler;
- anonymous endpoints;
- full visual debugger;
- automatic provider optimization;
- client self-service integration settings;
- video runtime;
- simultaneous implementation of Content Ops and LMS shells.

## 11. Definition of done for the branch

- the new domain has public contracts and no product-specific imports;
- compiler rejects invalid graphs deterministically;
- executor runs a supported graph through injected handlers;
- queue/worker behavior is covered for retry, cancellation, and lease loss;
- PostgreSQL persistence is either implemented or recorded as the next
  explicitly scoped commit with no fake production claim;
- architecture, typecheck, tests, and build are green;
- documentation distinguishes implemented behavior from the target API;
- no secrets, generated build artifacts, database dumps, or temporary reports
  are committed.

## 12. Open decisions for later, not blockers for Slice A-C

- which vertical becomes the first external pilot: marketing or education;
- whether the first consumer is Content Ops or Game24 LMS;
- which node types are admitted into the first production handler registry;
- whether Synergy permits OpenRouter or requires another/on-prem provider;
- final ecosystem and product names;
- extraction trigger thresholds for a separate service.

## 13. Implemented in the first branch slice

Implemented:

- isolated `contracts`, `core`, `server`, `adapters`, and `testing` boundaries;
- versioned pipeline definition contract;
- deterministic compiler with dependency and cycle validation;
- injected handler registry and level-based executor;
- typed input validation and declared output resolution;
- idempotent run service and explicit cancel service;
- queue/worker ports with claim, lease, heartbeat, retry, cancellation, and
  fencing after lease loss;
- in-memory adapter with deterministic unit tests;
- PostgreSQL schema for pipeline, version, endpoint, run, and node run;
- PostgreSQL queue adapter using `FOR UPDATE SKIP LOCKED`;
- additive migration `0008_wide_tattoo.sql`;
- persistence smoke for idempotency, retry, cancellation, and stale-attempt
  rejection;
- CI hook for the persistence smoke;
- architecture check preventing infrastructure imports in contracts/core.

Still not implemented and must not be presented as ready:

- Studio publication flow and graph-to-runtime adapter;
- production node handler registry;
- node-level checkpoint/resume;
- public or service runtime API;
- service account authentication;
- artifact object-storage adapter and retention job;
- signed webhooks;
- production pipeline worker process and health endpoint;
- Content Ops, LMS, or ChatModule consumer adapter.

The first persistence slice stores a bounded input/result JSON payload in
PostgreSQL for development and contract testing. Before media-heavy or sensitive
production use, large payloads and artifacts move to private object storage and
the database keeps references and checksums.

Whole-run automatic retry must not be enabled for provider handlers that may
have dispatched a paid operation. Such handlers need provider operation
reconciliation or node-level idempotency/checkpoints first; otherwise a retry
could duplicate cost.
