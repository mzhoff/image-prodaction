# Stories production presets

## What “preset” means here

Image Production now uses three separate preset levels:

1. **Contract preset** on `Pipeline Input` or `Pipeline Output` can fix the
   names, types and exact embedded schema of data crossing the service boundary.
2. **Canvas format preset** on `Composition` fixes the preview canvas dimensions.
   The first Stories format is `story-full-hd` (`1080 × 1920`).
3. **Pipeline preset** inserts a prepared group of connected nodes into the
   canvas.

These presets solve different problems and should not be treated as one shared
mutable configuration.

## Input fields belong to the pipeline

`Pipeline Input` is the place where a calling product supplies only the
business context needed to perform this particular pipeline. Examples are:

- `articleSummary` for an article cover;
- `visualBrief` for an illustration;
- `brief` for a single Stories background.

The Stories pipeline presets therefore use one required manual text field,
`brief`. They do not apply a Stories input contract preset. The visual style,
composition, aspect ratio, model and generation size are already configured in
the pipeline and do not have to be repeated by every caller.

Story, revision and slide identifiers describe the publishing lifecycle. The
calling console keeps those identifiers and associates its slide with the
returned run and result. Image Production does not need lifecycle identifiers
to generate one asset.

The generic input preset mechanism remains available for future capabilities
that have a real shared input contract. A preset should be added only when
several callers need the same stable business input, not merely because a field
exists in a calling product.

## Stories output contract

`story.production.result.v1@1.0.0` describes the result of producing one
Stories slide asset:

- required `background` — one workspace-scoped image artifact with an
  authenticated download URL, dimensions, MIME type, byte size and SHA-256;
- optional `title` — generated slide title;
- optional `subtitle` — generated slide subtitle;
- optional `body` — generated supporting text.

The exact closed schema lives in
`contracts/story-production/1.0.0/result.schema.json`. A background-only
pipeline omits all three text fields. A pipeline that also generates copy can
connect any of them to its text-generation results; when present, a text value
must not be empty.

Applying a boundary preset copies the exact schema and its checksum into the
node. Publishing copies that snapshot into the immutable pipeline version and
verifies the checksum again. The runtime validates the complete input and
output objects, not only individual canvas fields. A user must explicitly
detach the preset before manually editing its fields.

This is an Image Production result contract, not a duplicate of the full
portable `stories.feed` contract. The Stories Platform package remains the
source of truth for decks, slides and semantic layers. Buttons, polls, slide
ordering and the story lifecycle belong to the calling console and consuming
application.

## Pipeline presets

### `story.asset.render.v1`

Executable now:

```text
Story Production Input
  → Prepare visual prompt
  → Generate story background
  → Story Production Output
```

One run receives a plain `brief` and produces one background image. The caller
keeps the relationship between its story revision/slide and the returned
durable run.

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

Title, subtitle and body are optional generated content. Buttons, polls and
other interactive layers stay console-owned and host-rendered. The consuming
application owns spacing tokens, colors, typography, safe areas, motion and
interaction.

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

Content Hub can call released pipelines through their published authenticated
descriptors and endpoints. Its server keeps its own publication identifiers
and must not depend on canvas node IDs or mutable draft graphs.
