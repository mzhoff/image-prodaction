# ADR: API-first integration and a thin consumer SDK

Date: 2026-08-31  
Status: proposed for the vertical pilot; stable public SDK is not approved yet.

Related direction:
[Image Production in the product platform](./platform-integration-direction.md).

## Context

Image Production already exposes published executable pipelines through a
protected asynchronous Runtime API. Content Hub is the first real cross-product
consumer, but the same capability may later be used by other company products
and third-party services.

Copying request, polling, retry, artifact, and error handling into every product
would create incompatible integrations. Building a broad SDK and plugin
ecosystem before real consumers exist would freeze an unproven abstraction.
The current product decision is therefore vertical-first: prove a complete
workflow and its economics before extracting a stable platform surface.

## Decision

### 1. The Runtime API is canonical

The protected HTTP Runtime API remains the only execution boundary. The target
binding uses a semantic `capabilityKey`, a pinned immutable pipeline version,
and its schema checksums. During the first pilot a manually published pipeline
may still have `capabilityKey: null`; that temporary binding must use
`publicId + pinnedVersion + pipeline/input/output checksums`. A consumer never
addresses canvas node IDs or a mutable draft graph.

The API contract must publish machine-readable schemas for:

- pipeline descriptor and input/output JSON Schema;
- create-run, status, cancellation, result, artifact, and error payloads;
- idempotency and correlation headers;
- authentication and authorization failures.

For the first E2E, the canonical HTTP payloads, descriptor, JSON Schema, and
checksums are sufficient. After that E2E and before extracting the SDK canary,
publish OpenAPI and generated types from the same runtime contracts. A
handwritten SDK type must not become a competing source of truth.

### 2. Start with a thin server-side TypeScript SDK

After the first Content Hub integration proves the HTTP contract, extract only
the repeated transport mechanics into a small server package. Its scope is:

- configure Runtime base URL and server credential provider;
- read and verify the descriptor, pinned version, and schema checksums;
- create an idempotent run;
- poll with bounded timeout and backoff, or cancel;
- normalize versioned Runtime errors;
- download a protected artifact as a stream and expose checksum, MIME, size,
  and dimensions for consumer verification;
- emit correlation and technical telemetry without business or personal data.

The SDK must not execute a graph, choose a pipeline, own domain records, contain
provider logic, calculate pricing, or silently upgrade a pinned version.

Exact package name and public method names remain undecided. The initial package
is an internal canary, not a promise of a stable public API.

### 3. Keep product behavior in adapters

Each product keeps a small adapter around the Runtime API or thin SDK. The
Content Hub adapter owns:

- its capability bindings and feature flags;
- mapping an article or publication into pipeline inputs;
- deciding which result a user may accept;
- importing an artifact into Content Hub media storage;
- saving Content Hub domain state and presenting product-specific errors.

Other products implement their own mappings without forking Runtime or SDK
logic. This keeps the reusable layers as `contracts -> thin server SDK ->
product adapter`, with the application responsible only for composition.

### 4. Never put a service token in a browser or mobile bundle

Browser and mobile clients call their own trusted backend. The backend resolves
Workspace membership, entitlement, capability binding, cost limits, and service
identity before calling Image Production.

The current long-lived Bearer service token is server-only. A future direct
client integration requires a separately designed short-lived, narrowly scoped
credential or signed proxy flow; the server SDK must not be repackaged as a
browser SDK by changing its build target.

### 5. Delay public multi-language SDKs and plugins

Do not build React widgets, CMS plugins, workflow connectors, or generated SDKs
for several languages yet. Promote the package beyond internal canary only when:

1. Content Hub completes a real pinned-pipeline E2E;
2. a second independent consumer completes the same flow without copying
   transport logic;
3. consumer checks cover idempotent replay, timeout, cancellation, schema drift,
   protected artifact download, and Workspace isolation;
4. measured runs establish stability, latency, retries, and cost boundaries;
5. versioning, deprecation, token rotation, and upgrade/repin procedures are
   documented.

Only then decide from real demand whether to publish a stable TypeScript SDK,
generate another language from OpenAPI, or add a specific product connector.
A connector remains a product adapter over the same API; it is not another
pipeline runtime.

## First implementation slices

1. Content Hub calls one text pipeline through a product-owned backend adapter.
2. The same adapter pattern imports one converted image artifact.
3. Runtime contracts publish OpenAPI and generated TypeScript types.
4. Repeated transport behavior is measured and extracted into an internal
   TypeScript canary package.
5. A second consumer validates that the package is genuinely reusable.
6. Stable/public packaging is a separate decision after consumer evidence.

## Consequences

- HTTP remains usable immediately without waiting for an SDK.
- Consumers share generated contracts and transport behavior without sharing
  domain logic.
- Service credentials remain behind a trusted server boundary.
- Content Hub can move quickly without defining premature plugin APIs.
- Some duplication is accepted during the first vertical slice; it must be
  measured and removed only after the correct common boundary is visible.
