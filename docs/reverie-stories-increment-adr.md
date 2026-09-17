# REVERIE Stories production boundary

Status: accepted for local implementation by the product owner, 2026-09-12.

Image Production owns the recipe and durable generation. `reverieStories` is a
semantic terminal node: it assembles `stories.document@1.0.0`, including editable
slides, image/video references, title/subtitle/text, polls and business actions.
It does not publish content to mobile. Content Hub owns editorial revisions,
immutable published snapshots, delivery and poll responses. The shared contracts
package owns validation; PRODaction UI owns the controlled editor and gallery.

Public capability: `content.generate-stories`, input `brief` (text), output
`story` (JSON). Consumers bind a pinned executable pipeline version. A terminal
Stories node supplies its own output boundary; an extra generic Pipeline Output
is unnecessary. Existing generic pipelines keep their behavior.

For multiple generated slides, several Stories nodes feed a final Stories node
in `storyMode: sequence`. Its numbered document ports preserve author-defined
order and allow image and video slides in one story without authoring JSON.
Different style revisions/locales are rejected until the author aligns them.
Editor changes remain a content draft. Connected recipes and sequence nodes
rebuild their output from inputs on every run; a standalone node without inputs
uses its saved document. Editing one generated result must not freeze future runs.
The public JSON field includes `documentFormat` and `documentSchemaChecksum`:
the exact shared validator governs this named format, while the existing bounded
generic schema language remains unchanged. These fields participate in the
immutable output boundary checksum and Runtime v2 compatibility checks.

Only verified assets in the execution workspace may appear in the result.
Production artifact references are materialized by Content Hub using server
credentials; mobile never receives those credentials. Video, poster, checksum,
dimensions and duration are included from real stored metadata. A missing poster
or invalid text produces an actionable error, never silent truncation.

The content structure has semantic layout and pinned style references. Host
styling and safe areas remain under SDK control. Preview polls do not submit
answers. Publishing a recipe and publishing a generated Story are separate acts.

Until the shared packages are released to the registry, the exact contracts
`3.0.0-canary.0`, editor `0.1.0-canary-stories.5` and media
`0.1.0-canary-media.4` archives are retained in
`.local-packages` with lock-file integrity. They are immutable package outputs,
not copied source implementations. Consumer upgrades pin the same immutable
archive; updating Image Production does not implicitly update Content Hub.

The Stories editor uses the shared Composition shell in a viewport-sized modal
with a blurred backdrop. A top filmstrip selects slides; the left structure
selects layers, background or document/slide settings; the right inspector shows
only that selection. Canvas selection is an editing operation, while the explicit
preview mode exercises playback and local poll interactions. Save/cancel and
draft history belong to the host adapter. Editor controls use PRODaction UI;
the Story preview retains the target application's style tokens.

The operator script `scripts/reverie-stories-local-pipeline.ts` provisions a
clearly named, deterministic local delivery fixture with real image/video files
and a zero-dollar execution policy. It does not evaluate AI copy quality. The
20-run generation benchmark remains a separate acceptance gate.

The separate AI recipe is defined by `reverie-stories-ai-preset.ts`: a brief
produces six structured text fields, two semantic Stories slides (image and
video with a poster), then one sequence. It reuses the current model defaults
and existing workspace media. `scripts/reverie-stories-ai-pipeline.ts` previews
the permissioned publication by default; `--apply` creates or reuses only the
exact named recipe. It does not call an AI provider, create a runtime grant or
change the delivery fixture's binding. Publishing this recipe does not authorize
paid generation. Instructions request text within 100/160/600 characters; the
Stories validator rejects longer results without truncation. The existing
provider retry repairs invalid structured responses, not valid JSON with text
that exceeds Stories limits. Automatic length repair and measured AI quality
remain outside the local delivery fixture acceptance.

Local acceptance requires the actual pipeline → Hub editor → publication →
mobile image/video/poll path, then update, unpublish and offline checks. Unit tests
and a saved draft are not evidence that this acceptance has passed.
