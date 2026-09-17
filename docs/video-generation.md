# Video fragments: research and implementation contract

Studio accepts ready local Crop/Export image outputs for first/last frames and
references. On an explicit Generate click it reads the full processed blobs and
uploads each distinct local asset once into the captured document/Workspace.
Remote inputs reuse their server IDs; thumbnails and upstream originals are never
substituted. Only after every upload succeeds is the immutable request/key saved
and submitted. Navigation or preparation failure prevents a paid submit. Retries
of that request reuse the frozen server IDs. No manual Save to Library is needed.
The server/API and executable runtime still require authorized server asset IDs;
this is Studio input preparation, not permission to pass arbitrary public URLs.

Studio presentation: Result reserves an aspect-ratio placeholder before submission.
The existing visual waiting experience stays inside that plate. Generate remains visible
and disabled while the current durable request is unresolved; processing and concise red
errors appear below it without HTTP codes or gateway details. Check-result, cancel and
prepare-new-request keep the same durable execution behavior, with the paid-cancellation
warning on the cancel tooltip. Version arrows live on the player overlay at top left;
Library, download and fullscreen actions follow the ImagePlate pattern at top right.
The inline and fullscreen players use the private saved video asset. No server execution
contract changed.

Research checked 2026-09-12. Scope: one reusable Generate Video node per storyboard fragment; not an editor, avatar tool, clip stitcher or upscaler. Fits the accepted Stories vertical (Notion product 3b875415801481bd9672e1115d5d5811, P1 active pilot).

## Provider-independent contract

Keep model publisher/key separate from gateway route. Studio stores semantic settings and image asset IDs, never credentials or vendor job URLs. The first adapter is OpenRouter; future adapters implement the same submit/poll/download contract. No platform ownership, service or database split is needed.

The live `/videos/models` catalog supplies discrete duration/resolution/ratio sets and first/last-frame, audio, seed flags. Null is unknown, not supported. Do not infer a range from discrete durations. Fail closed if discovery fails. Model-family inclusion is curated; editing/upscaling/avatar entries are excluded.

| Families currently discovered | Inputs / controls |
| --- | --- |
| Google Veo; Kling; Seedance; Wan; Sora; Runway; Hailuo; Grok | Text, plus only frame flags actually advertised by the live catalog; duration, resolution, aspect ratio, supported audio/seed |
| Verified Seedance 2 variants; Wan 2.7 / 3.0 | Reference mode, with separate ordered descriptions; app limit 3 images, not a claimed vendor maximum |

Three distinct modes: text; first frame with optional last frame; reference guidance. Mixing anchors and references is rejected because the upstream API otherwise gives frame images precedence. A missing image must never silently turn image-to-video into text-to-video. Port IDs stay stable, while Studio and `document_graph` expose only the image inputs of the active mode; the selected model can additionally hide an unsupported last frame or entire mode. Dormant image edges are not sent in another mode.

The selector presents model-family names without publisher/gateway prefixes and pairs them with compact offline marks. Most marks use the open [Simple Icons](https://github.com/simple-icons/simple-icons) SVG set; Runway follows its [official brand assets](https://runway.com/brand-guidelines). Brand marks identify model families only and do not change provider routing.

Reference descriptions become an ordered prompt section with image numbers and stable source slots. They are guidance, not guaranteed exact storyboard timing. Generic API has no per-image description field. Provider-specific passthrough names alone do not establish value constraints; arbitrary provider JSON and undocumented controls are not exposed.

## Durable and private execution

Validate scope, model capabilities, options and assets before dispatch. Images are sent inline as data URLs, supported by the official OpenRouter video integration reference; no public bucket or tunnel. Server stores the provider operation ID once, polls the same operation, downloads authenticated MP4 content from a fixed allowlisted origin, verifies media, and persists a private asset. Browser only polls our job ID. Reopening the project resumes the same job. A dispatch with unknown outcome is not automatically resubmitted. UI cancellation does not promise vendor cancellation or a refund. No paid smoke test without explicit approval.

Limits: one output per click, at most 30 seconds per fragment and 3 reference images, bounded 45-minute operation, bounded output download. Price is provider-reported usage; missing cost is unknown, never zero. No invented price estimate. Video API is not ZDR eligible; do not bypass enforced provider privacy settings.

Private reference transport prepares a copy at up to 2048 px, with orientation applied, white transparency background and JPEG quality 90; stored originals are unchanged. Each source is bounded to 32 MiB / 80 megapixels. Output is bounded to 128 MiB and inspected before persistence.

Content restrictions are independent from format capabilities. A real request to
Seedance 2.5 returned `InputImageSensitiveContentDetected.PrivacyInformation`:
the input portrait was classified as a real person. This does not establish a
base64 transport problem; the official inline-image reference explicitly supports
data URLs. Do not introduce public asset URLs to bypass a content rejection.
A separate neutral geometric frame was accepted (202), then failed during rendering
because the generated output audio was flagged for possible copyright restrictions.
This asynchronous rejection is surfaced separately; users can explicitly choose a
new silent generation. The app never silently switches audio, model or input content.

The shared video adapter unwraps nested provider errors and reads at most 64 KiB
of error JSON. The job stores a bounded sanitized `videoProviderDiagnostic` in its
metadata (stage, HTTP status, upstream code, request ID and detail). Credentials,
supplied prompt/reference descriptions, data URLs and URLs are redacted. Studio
gets a concise localized reason. Confirmed submission rejection is distinguished
from an unknown dispatch outcome; neither triggers an automatic paid resubmit.
Terminal polling errors preserve their reason and provider-reported usage.

`scripts/diagnose-video-job.ts SOURCE_JOB original|neutral|silent` is read-only by
default. `--execute-paid-test` explicitly enables one auditable test (source
limited to 5 seconds at 480p), with a stable idempotency key and a normal job lease,
private input/output storage and usage accounting. Never use it without approval
for the paid test. It cannot retry an already created diagnostic request. `silent`
keeps the source inputs/settings and explicitly disables generated audio.

Studio and executable pipelines use the same stable ports and semantic settings. Runtime handler `ai.video.generate@1` returns a private video artifact and retains run/node idempotency. Strict runtime budget policies that require a known upper-bound estimate remain fail-closed; this integration does not bypass those limits or invent video prices. One node represents one fragment; stitching and timeline editing are separate future work.

## Crop video in executable pipelines

`Crop` keeps its `cropImage` node identity and legacy image ports (`image` → `result`).
The new video route is `video` → `videoResult`, executed by `video.crop@1`.
Only one video source is supported in a published recipe. Image-only Crop remains
a Studio operation; mixed image/video inputs fail publication with an explicit error.

The immutable recipe stores `aspectRatio` and an optional normalized
`crop: { x, y, width, height }`. It never copies the Studio result asset ID.
Each run crops the video actually produced by its upstream node, including a new
Generate Video result or a pinned Import. Without an explicit rectangle, fixed
ratios produce a centered crop; `Custom` uses the full frame. A fixed ratio with an
explicit rectangle preserves its origin and fits the bounds to the actual video
dimensions. Rotation is resolved from authorized stored metadata, not client hints.

The existing Workspace video derivation service writes the H.264 derivative and
retains its default audio stream when present. Source authorization, cancellation,
bounded processing, private storage and deterministic derivative reuse also apply
to runtime Crop. The handler does not fetch caller URLs or trust cached client
results. `videoResult` is a typed private artifact accepted by the Stories video
input; Stories still requires its separate poster input.

Focused checks cover Import/Generate Video → Crop → Stories through the compiler,
executor and Stories handler with substituted generation/storage dependencies;
they do not send a paid generation request. Additional checks cover malformed
inputs, mixed media, rotation, aspect-only recipes, source checksum/workspace
validation, cancellation and output artifact type.

### Crop verification — 2026-09-12

- Local browser check used a synthetic 640×360, three-second red/blue video with
  audio. Dragging its video output offered Crop; selecting 9:16 and moving the
  rectangle to the blue region produced a real 202×360 H.264 MP4. The pixel
  dimensions shown in the controls match the encoder's even-dimension output.
- Changing the rectangle/ratio invalidated the old output. Undo restored it;
  reloading the page retained the processed asset without encoding it again.
- Connecting the output and a separate poster to Stories played that same
  202×360, three-second video in the shared editor. The local example is
  [Проверка Crop видео](http://127.0.0.1:7310/projects/01a0961a-6bac-7812-9fea-ef69b9dd87af).
- Eight real FFmpeg checks passed, including the selected pixel region,
  rotation, audio preservation/selection, silent input and WebM conversion.
  Focused graph, assistant, client and executable-runtime tests passed, as did
  full typecheck, lint, architecture checks and the production build.
- Web and pipeline worker were updated locally. Content Hub's existing Runtime
  v2 connection still matched its client identity and returned six grants.
  This check does not claim mobile end-to-end delivery or a production release.
- Separate preview issue observed: Watch mode can flag a short two-line title
  as overflowing when the text region measures 66px scroll height against 64px
  client height. Video playback succeeds; the shared preview's text-overflow
  measurement needs a focused follow-up with both short and overflowing text.

## Primary sources

- [OpenRouter video guide](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)
- [Live model catalog](https://openrouter.ai/api/v1/videos/models)
- [Submission schema](https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request)
- [First and last frames](https://openrouter.ai/docs/cookbook/video-generation/image-to-video)
- [Reference guidance](https://openrouter.ai/docs/cookbook/video-generation/reference-to-video)
- [Official inline-image integration reference](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-video/SKILL.md)

Model availability is not a popularity ranking; runtime discovery, not this snapshot, determines selectors. External paid/model quality verification remains a separate acceptance gate.

## Verification — 2026-09-12

- `npm test`: 999 passed, 10 infrastructure-dependent tests skipped, 0 failed.
- `npm run typecheck`, `npm run lint`, `npm run check:architecture`: passed.
- `npx playwright test e2e/video-generation-node.spec.ts --workers=1`: passed against the rebuilt local container. The test creates an isolated local QA login and mocks the document, autosaves and generation job; it never sends a paid provider request. It verifies mode validation, model-dependent selectors, stable frame connections, one submission across reload, private result playback, version navigation, download links, input-label separation and player insets. Light/dark visual artifacts were inspected.
- The live catalog returned 22 compatible model variants; 49 valid text/frame/reference setting combinations passed request validation. Anonymous submit was rejected with 401; invalid authenticated input was rejected with 400. The mocked browser/catalog checks created no paid video request.
- Local web, generation worker and pipeline worker use the rebuilt image `fefd5362ae46`; runtime settings preserved. All three are healthy. Content Hub's internal readiness returned 200; authenticated Runtime v2 client identity matched, and its catalog returned 6 grants / 7 pipelines, unchanged across the restart.
- Browser verification includes the actual nested portrait rejection: the alert shows the localized reason, not HTTP/OpenRouter/400. The rebuilt adapter also correctly read and classified the real asynchronous audio rejection via a GET of the existing provider operation, without resubmitting it.

### Explicitly authorized Seedance 2.5 diagnostic requests

The original source job was `01a09349-1279-76bd-934f-21242f21f257`.
Its record and saved request were not rewritten. These were three separate,
auditable requests, each with one POST and no automatic resubmission:

| Diagnostic job | Inputs | Actual result | Reported cost |
| --- | --- | --- | --- |
| `01a09351-1b6f-7b8f-8ff1-3c261352c428` | Original portrait/settings, audio enabled | HTTP 400, `InputImageSensitiveContentDetected.PrivacyInformation` | Unknown |
| `01a09356-9532-7d82-b0f1-3b4c5adb666f` | Independent geometric frame, audio enabled | HTTP 202, then output-audio copyright rejection | Unknown |
| `01a0935d-2f27-7d9c-9269-3869d8fba093` | Same geometric scene, audio disabled | Completed, downloaded, inspected and saved | $0.51827590 |

The successful result is private Library asset
`01a09361-f8b2-730a-8ed0-43d6d31576e3`: MP4/H.264, 480 x 854,
24 fps, 5.041667 seconds, no audio, 1,487,577 bytes. Provider operation:
`inkz7Wpqwqcr1mpPyPur`. End-to-end processing took about 5 minutes 14 seconds.
The ledger still marks overall usage incomplete (no token totals); the quoted
provider cost is known, not an estimate. The two refusals have no reported cost;
do not describe the total diagnostic spend as exactly $0.51827590 or the refusals
as free. `/generation` lookup for the audio-rejected video returned 404.

This proves Seedance's inline image-to-video transport, polling, download and
persistence on the neutral silent case. It does not prove every catalog model,
audio generation or portrait input succeeds. Provider content checks remain in
force. No image publishing gateway, public bucket or content-filter bypass was added.
