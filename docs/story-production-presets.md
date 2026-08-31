# Stories production presets

## What “preset” means here

Image Production now uses three separate preset levels:

1. **Contract preset** on `Pipeline Input` or `Pipeline Output` fixes the names,
   types and exact embedded schema of data crossing the service boundary.
2. **Canvas format preset** on `Composition` fixes the preview canvas dimensions.
   The first Stories format is `story-full-hd` (`1080 × 1920`).
3. **Pipeline preset** inserts a prepared group of connected nodes into the
   canvas.

These presets solve different problems and should not be treated as one shared
mutable configuration.

## Boundary contracts

The first capability has two immutable contracts:

- `story.production.request.v1@1.0.0` — identifiers, visual brief and pinned
  generation/format choices for one slide background;
- `story.production.result.v1@1.0.0` — one workspace-scoped image artifact with
  authenticated download URL, dimensions, MIME type, byte size and SHA-256.

The exact schemas live in:

- `contracts/story-production/1.0.0/request.schema.json`;
- `contracts/story-production/1.0.0/result.schema.json`.

Applying a boundary preset copies the exact schema and its checksum into the
node. Publishing copies that snapshot into the immutable pipeline version and
verifies the checksum again. The runtime validates the complete input and
output objects, not only individual canvas fields. A user must explicitly
detach the preset before manually editing its fields.

This is an Image Production capability contract, not a duplicate of the full
portable `stories.feed` contract. The Stories Platform package remains the
source of truth for decks, slides, semantic layers, actions and poll behavior.

## Pipeline presets

### `story.asset.render.v1`

Executable now:

```text
Story Production Input
  → Prepare visual prompt
  → Generate story background
  → Story Production Output
```

One run produces one background image. The caller keeps the relationship
between its story revision/slide and the returned durable run.

### `story.slide.preview.v1`

Authoring preview:

```text
Story Production Input
  → Prepare visual prompt
  → Generate story background
  → Story Composition (1080 × 1920)
  → Story Production Output
```

The Composition node gives the constructor a local visual preview at the exact
target size. It is intentionally marked **authoring only**: the current server
runtime has no `image.compose` handler, so this graph must not be published as
an executable pipeline yet. The executable asset slice above is the honest
first pilot.

Text, title, poll and action layers stay semantic and host-rendered. Image
Production generates content and background assets; the consuming application
owns spacing tokens, colors, typography, safe areas, motion and interaction.

## External consumer contract

An authenticated consumer can read the pinned descriptor at:

```text
GET /v1/pipelines/{publicId}
```

The descriptor returns the pinned pipeline version/checksum and both boundary
schemas/checksums. Runs remain queued and idempotent through:

```text
POST /v1/pipelines/{publicId}/runs
GET  /v1/runs/{runId}
GET  /v1/runs/{runId}/artifacts/{assetId}
```

The bearer token stays in the calling server. It must never be sent to a
browser or mobile application.

## Pilot gate

Before integrating a Stories management cabinet, run the pinned capability 20
times with concurrency `1` and record QA, total duration, retries, provider and
model, actual cost, manual correction time, MIME/dimensions and artifact
checksum. Proceed only if the result is stable and the manual correction cost
does not erase the product value.

Content Hub and ТОКБЕРИ are deliberately outside this implementation slice.
They will consume the released contracts later without depending on canvas
node IDs or mutable draft graphs.
