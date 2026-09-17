# Canvas file import progress

Updated: 2026-09-10.

Dropping files onto the canvas opens a compact status card immediately above the
bottom toolbar. It uses the current product font, theme tokens, a spinner, the
current filename and a real processed-file counter. HEIC/HEIF conversion to JPEG
and upload have separate labels; adding the finished assets is the final stage.
The shared `ProcessIndicator` also serves Timeline Handoff. It displays an
approximate remaining time only after completed files provide a measured average;
this estimate may change for differently sized files. Each file counts only after
its upload has succeeded or failed. Upload/conversion remains sequential to bound
memory use for iPhone photo batches and large audio/video files.

Successful assets are inserted after processing the batch, with one Undo/Redo
action. A failed file does not discard prior successes or prevent later files
from being attempted. The outcome lists successes and failures; the last failure
includes its filename and error. Success hides after five seconds, while an
error outcome remains until dismissed. Another drop during an active import
gets a wait message. Navigation invalidates the batch so its result cannot be
inserted into another document. An already-started request may still finish in
the original document's asset storage.

Progress lives in a per-canvas store. Only the status card subscribes, so progress
updates do not rerender every node. The card, other notices and toolbar share a
bottom stack, including narrow screens and wrapped toolbars. The card has a
polite live region, a labelled native progress bar and reduced-motion support.
The scope is Studio feedback; there are no new ports, assistant settings or
runtime capabilities. Import's live help and assistant catalog projection include
this behavior.

Updated 2026-09-12: presentation was extracted to `src/shared/ui/process-indicator.tsx`.
The producer supplies completed/total work, stage and optional measured estimate;
unknown work uses an indeterminate bar. Import retains its existing per-canvas
store, partial-success behavior and dismissal policy.

## Verification

- Unit: 42 files, one failure, retained successes, sequential processing, stage
  updates, and invalidation during document navigation.
- Chrome browser: 42 synthetic HEIC files decoded by the real HEIC decoder and
  uploaded through the local API. One upload is deliberately failed; the first
  and 25th responses are held to inspect live progress. Verified 41 resulting
  Import nodes, a single Undo/Redo, duplicate-drop feedback, success auto-dismiss,
  desktop and 390px layout. These small fixtures verify feedback and conversion,
  not a throughput estimate for full-resolution iPhone photos.
- `npm run typecheck`, `npm run lint -- --quiet`, `npm run check:architecture`
  and focused node-help/node-catalog tests pass.
- Local `npm run build` passes with the installed UI canary; the existing NFT
  tracing warning in the video processor remains unrelated to import progress.

Browser test: `e2e/canvas-import-progress.spec.ts`. It defaults to generated PNG;
set `CANVAS_IMPORT_HEIC_FIXTURE` to a real or synthetic HEIC file to exercise the
decoder. `CANVAS_IMPORT_API_URL` can use the existing local API when testing a
separate local frontend; both hosts are required to be loopback addresses.

## Local delivery limitation

At verification time, the checkout also contained a separate in-progress UI
migration to `@prodactionpro/ui-core` version
`0.2.0-canary-reverie-20260910.2`. This package was installed locally from a tarball
but absent from package.json/package-lock.json; a clean Docker build therefore
cannot resolve the UI imports. The private-package credential works when passed
through `compose.private-packages.yaml` as a BuildKit secret. Completing the UI
package's reproducible dependency setup is required before recreating the main
web container. No production container was replaced by this task.
