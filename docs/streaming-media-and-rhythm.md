# Streaming media and reviewed rhythm grids

Owner request, 21 September 2026. Extend the existing application and workers;
assets remain owned by the current Workspace. No new service or broker.

Uploads use standard HTTP multipart, parsed incrementally into private temporary
files. Files have byte limits, cancellation, bounded concurrency/disk reservations
and cleanup on success/failure. FFmpeg and S3 consume file streams; a video is
never converted into a whole-file JavaScript buffer along this path. Small image
decoding and bounded generated outputs retain explicit memory limits.

Rhythm preparation is local computation, with no LLM credential or charge. Its
durable result contains the music analysis and variable-length empty cells. AI
assembly is a separate explicit action against that reviewed result. Pacing is
a duration preference, not a fixed beat divisor; the original music is unchanged.
The AI receives scene descriptions and the reviewed cells. Applying a proposal
uses the original document revision and preserves fixed clips.

## Transfer and processing contracts

Ordinary HTTP is sufficient; no WebSocket server was added. Browser `File`/FormData
is sent as multipart, Busboy parses it with backpressure, a private temporary file
is written incrementally with SHA-256, then S3 receives a file stream. The HTTP
response is sent after storage and job submission, before media inspection.

| Surface | Behavior |
| --- | --- |
| `/api/assets/images`, `/api/assets/audio`, `/api/assets/video` | `202 {asset: pending, job, statusUrl}`. Existing canvas, Library, subject references, Timeline and playground clients wait for ready through the common upload helper. |
| `/api/generation-jobs/:id` | Existing durable job status and ready asset. `asset_ingest` uses the current generation worker, checkpoints/leases/cancellation, up to three attempts, no AI provider. |
| `/v2/runtime/assets/audio` | Same external synchronous `201` contract; multipart ingress and inspection are file-backed. |
| Project thumbnail | Streamed multipart; bounded image decoder; synchronous `201` retained. |
| Telegram Publication | Streamed multipart and file-backed outgoing form; explicit publication only, up to 10 files / 100 MiB combined. No messages sent in QA. |
| Chat HEIC/reference and provider image payloads | Keep explicit small byte/pixel limits. HEIC is capped at 8 MiB; decoding and provider image encoding may use bounded buffers. |

Upload routes bypass Next's proxy body clone/buffering. They still enforce their
own session/Workspace authorization; browser mutations verify Origin, Runtime
uses its existing service authentication. Neighboring routes remain behind proxy.
The byte meter does not trust Content-Length, filenames or MIME. Invalid media
stays unavailable until inspection; successful replay returns the existing asset.

Once the server returns `202`, closing the page does not cancel processing.
Closing the page before transfer completes interrupts that transfer. This is not
a resumable/multipart-S3 upload protocol; byte-level resume and a global client
upload center are deferred. A retry after a lost HTTP response can create another
asset, while retries of an accepted job reuse the original asset.

## Limits and operations

- Input video: 1 GiB, 30 minutes, 4096 pixels per side, 120 fps. Audio upload:
  50 MiB / 30 minutes. Existing image limits remain configured by image policy.
- Derived media and final MP4: 128 MiB. FFmpeg output buffers are deliberately
  bounded; only large original media was removed from whole-file JS buffering.
- Four concurrent incoming transfers per process; 4 GiB total reserved source
  temporary capacity per process; at least 2 GiB spare disk before reserving.
  Multipart permits up to 1 MiB envelope overhead; file sums are checked separately.
- Transfer timeout 30 minutes, S3 source read timeout 10 minutes; existing FFmpeg
  processing queue permits two decoders plus eight waiting operations per process.
  Limits are not global across replicas. Reverse proxy/body limits, replica count
  and temporary volume capacity must agree in the release environment.
- Normal completion, errors and cancellation remove temporary inputs. Forced process
  termination may leave temporary directories; no broad disk sweeper was introduced.
- No Docker restart, new service, broker, Python runtime or schema migration.
  Worker/web must be delivered together because browser uploads now depend on the
  `asset_ingest` handler. No production capacity claim without a load test.

Stored video/audio is streamed to a verified file before analysis, Timeline Handoff,
poster extraction, trim/split-audio, conversion, transcription or montage rendering.
Consumers release the handle in `finally`; FFmpeg opens the path directly. Private
paths are server-created handles, never accepted from client JSON. Retention protects
pending ingest jobs and media referenced by Timeline/jobs.

## Two deliberate montage actions

The editor has a collapsible music panel and a separate job result for the grid.
`rhythm` calculates beats/energy locally and creates variable cells. Calm prefers
4–6s, normal 2–4s, dynamic 0.5–2s; mixed responds to energy. Timing is frame-quantized.
The final cell and boundaries around fixed clips may differ from these preferences.
Manual BPM, half/double controls and first-beat offset change the grid, not audio speed.

`plan` requires a completed `gridJobId` matching the current saved revision and
snapshot. It cannot accept BPM. A >100-cell grid is rejected before paid work.
Only this explicit button requests scene descriptions and AI selection. A scene can
span up to three adjacent free cells to retain a meaningful action; lock crossings,
overlaps, holes, repeated coverage and out-of-source ranges are rejected. Source
descriptions/checksums are reusable across music and duration changes.

The previewed proposal needs a separate apply with `expectedRevision`. Manual edits
invalidate stale grids/proposals. Job polling resumes for the last job in this tab;
it never silently applies a result. Audio from Library includes generated audio.
Render is a durable job on the saved snapshot; the download is marked when it belongs
to an earlier revision. Browser preview follows the video playhead; FFmpeg is the
frame-accurate output, not a promise of NLE-grade HTML media playback.

## Local evidence, 21 September 2026

- Combined media/asset/Timeline/transcription/Runtime/parser/client polling/node-help/
  assistant/route/actual Next matcher suite: 135 passing checks, no skips.
  Five additional character/reference and pipeline image operation checks passed
  after enforcing bounded streaming reads for those images.
- 14 real FFmpeg/ffprobe codec checks passed (audio/video/timeline processors and
  MP4 render). No paid model used.
- A real valid MP4 enlarged to 129 MiB with a legal `free` atom passed streamed
  storage-read, inspection, poster, trim and render checks. RSS increase during the
  stream stayed below the 96 MiB test threshold. This exercises the former size
  boundary, not a multi-user or full-1-GiB load test.
- PostgreSQL + S3: pending content denial, ready transition, retry reuse, local
  rhythm without credentials, explicit plan preflight and rejection of stale grids.
  DB records rolled back; task-owned S3 objects removed.
- Chromium: real editor/session, mocked Timeline/job/media APIs. Prepare grid,
  change BPM, require recalculation, separate plan, apply, MP4 link, add an audio
  track and mark an older rendered revision after saving. This proves
  UI wiring, not model quality or live browser rendering of a real source.

Repeat with the normal Node test loader. Codec checks require `FFMPEG_PATH`,
`FFPROBE_PATH`, `VIDEO_CODEC_TESTS_REQUIRED=1`; the large-file check requires working
codecs. DB/S3 integration is guarded to local hosts and uses
`MEDIA_LOCAL_INTEGRATION=1`, `DATABASE_URL` and normal S3 env.
Chromium uses `TIMELINE_PRODUCTION_UI_QA=1`, `PLAYWRIGHT_BASE_URL` and local
`STORIES_TEST_DATABASE_URL`. Paid-provider quality, production concurrency and
CapCut/Premiere/Resolve roundtrips remain untested.

Final local typecheck, lint, architecture and file-size checks passed. Temporary
QA server stopped; downloaded codec tools removed (61.3 MiB actually reclaimed).
No deployment or Docker stack changes were performed by this task.

### Canvas banner upload recovery — 21 September 2026

A later live upload exposed two integration issues: a worker started before
`asset_ingest` was introduced rejected that operation, and the shared success
transaction assumed every returned asset was AI-generated. The generation worker
was restarted with current mounted sources. Upload completion now validates the
ready file against the job's asset ID, checksum, creator, Workspace and document,
preserving its uploaded/saved origin. Generated-asset publication stays separate.

The PostgreSQL/S3 image regression exercises the production dispatcher, WebP
original and thumbnail with alpha, replay and the real success transaction. Wrong
asset metadata/checksum cannot complete the job. Fixtures roll back and their S3
objects are removed. A real Banner upload through the browser and running worker
returned its image successfully, without a paid provider call.
