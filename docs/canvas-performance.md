# Canvas interaction and media performance

## Implemented boundary

- Node dragging uses a gesture-local visual preview. Pointer movement only updates
  the moved cards' CSS transforms and adjacent SVG paths, at most once per frame.
  No graph store mutation, history snapshot or document autosave happens per move.
- Pointer release commits final positions once. Escape, pointer cancellation, blur
  and unmount discard the preview. The undo checkpoint is taken immediately before
  commit so a generation result received during dragging is not removed by undo.
- Existing selection z-index is presentation only; it does not reorder `nodes`.
- Connection drafting updates only the provisional SVG path during pointer motion;
  actual connections change on a valid drop, not while hovering.
- Unchanged NodeCards are memoized and receive stable, latest-event callbacks.
  Port observers ignore movement/z-order mutations and refresh after a gesture.
- Persistence deduplicates history-only updates before sanitizing/stringifying.
  Durable storage still uses the existing validated **whole-document snapshot**
  after a completed edit, not a new coordinate-patch network protocol. This is not
  per-frame serialization, nor a claim that no O(N) work remains at commit time.

## Project overview on Back

Automatic DOM capture on autosave is removed. Back takes a small scene projection
of card rectangles, short text, thumbnail URLs and SVG paths. A Web Worker draws an
840×500 overview using OffscreenCanvas. It reads only thumbnails, with concurrency
4, at most 128 unique images and a 30-second task timeout. Every card remains in the
overview; missing/over-limit images fall back to a text card. Worker/bitmaps are
disposed, and no original-image cache is retained in JS.

Navigation does not wait for the worker or network. The final document save is
serialized behind any in-flight autosave, using a snapshot frozen before unmount.
Reopening the same document waits for this save; failures retain local recovery.
The overview upload includes the acknowledged revision, checked again atomically
at the database update. A stale auto overview cannot replace a newer document or
a manual thumbnail. The project list refreshes after the background upload.

Manual Make snapshot retains exact DOM capture and manual priority. The automatic
overview intentionally is not a pixel-for-pixel screenshot of all card controls.
Closing the entire tab/browser can interrupt background work; local recovery is
the protection for document edits, not a promise of durable browser background jobs.

## Image representations

The bottom toolbar displays the current canvas zoom, rounded to a whole percent.
It reads the same viewport scale as the canvas transform (not the original image's
pixel scale), with no new timers or graph mutations. After visual testing, the
user selected **135%** as the maximum canvas zoom. The minimum stays at 10%.
The existing navigation clamp applies this limit to gestures, programmatic zoom
and saved viewports; fullscreen viewing of original images is unaffected.

- Original: immutable private asset, full-resolution processing/download/fullscreen.
- Thumbnail: existing S3 `thumbnail` variant, WebP quality 82, fit inside 560×560;
  legacy remote assets can create it lazily. Canvas cards and reference strips use
  `content?variant=thumbnail`. Legacy IndexedDB images get a bounded preview blob.
- Model transport: the existing server optimizer may encode full-resolution
  lossless WebP when smaller; no pixel resizing. It never modifies the original.
  This transport variant is currently transient, not a third permanent S3 copy.

Crop/Adjustment processing and fullscreen composition/sketch editors retain their
original sources. A thumbnail must never replace `assetId` in graph execution.
Private immutable HTTP caching reuses original bytes on repeat fullscreen opens;
it is browser-managed rather than an unbounded custom memory cache.

## Verification

`graph-state-storage.test.ts` covers coordinate-only mutation, node order/reference
preservation and no persistence for history-only changes. `document-exit-tasks.test.ts`
covers reopen sequencing and failed-save recovery availability.
`e2e/canvas-performance.spec.ts` checks transient drag/arrow, cancellation, undo,
thumbnail/fullscreen URLs, loader coexistence without paid requests, no in-editor
auto snapshot, immediate Back with an in-flight save, final text and auto/manual
thumbnail revision protection. Run on the local production build, not only dev.

`e2e/canvas-zoom.spec.ts` checks the toolbar against the actual canvas transform:
zoom in/out, the 10–135% bounds, repeated Ctrl/Meta-wheel zoom, pan, fit and reload,
including a legacy saved viewport above the new maximum. It also verifies
fixed indicator dimensions and toolbar fit at a 390 px viewport.
`use-canvas-navigation.test.ts` directly checks initialization with a legacy 240%
zoom: it clamps to 135%, while values within bounds remain unchanged. The check and
the 50-card drag regression passed on the updated local production build on
2026-09-08. The drag probe still made zero graph storage writes during movement.

### Local verification — 2026-09-08

- Full unit suite: 793 passed, 10 explicitly skipped, 0 failures.
- Typecheck, lint, architecture boundaries and whitespace checks passed.
- Local production image: `image-prodaction-web:codex-local`, image ID
  `sha256:6ae1121f5f796b5211bef685ee513510b4f9178ce46849e7a8dcffc09225ec6a`.
- Browser checks passed: canvas performance/exit, reference port persistence,
  Transcribe controls, Timeline Handoff interaction and the 50-card drag probe.
- Synthetic 50-card probe: 120 pointer steps, 119 animation-frame intervals,
  p95 interval 8.4 ms, 0 intervals above 50 ms, **0 graph storage writes during
  movement**. This is a local synthetic measurement with placeholder images,
  not a before/after benchmark of the user's project or an FPS guarantee.
  A repeat produced 120 intervals, p95 8.9 ms, again 0 intervals above 50 ms and
  0 graph storage writes during movement.
- Large-image browser fixture: a 3200×1800 original is displayed using its
  560 px thumbnail; fullscreen requests the original. AI request is intercepted
  to exercise the loader; no paid generation is dispatched.
- Direct/proxy readiness: HTTP 200. Content Hub authenticated Runtime v2 check:
  enabled, 7 grants, 5 pipelines, all 5 bindings HEALTHY. Only `web` was recreated;
  workers, databases, volumes and user documents were not replaced.
- Build cache cleanup: Docker reported 4.227 GB reclaimed; host free space rose
  from approximately 30 GiB before cleanup to 33 GiB after disk space was returned.
  Containers, volumes and in-use images were retained. Disk space remains below
  the repository's 15% headroom threshold; no broad image/data cleanup was performed.
