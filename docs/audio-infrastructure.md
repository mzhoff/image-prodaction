# Audio storage and local processing

This is an additive audio slice. Existing image upload and image Export contracts
are unchanged. Image Production is not a public audio hosting service.

## Accepted files and limits

- Ogg with Opus or Vorbis (`.ogg` / `.opus`).
- M4A with AAC or ALAC; file extension does not determine its codec.
- MP3, AAC/ADTS, FLAC, and WAV with supported uncompressed PCM.
- One audio stream, mono or stereo, 8–192 kHz, known positive duration ≤30 minutes.
- External uploads: ≤50 MiB. Managed intermediate/output audio: ≤128 MiB.
- Real video, playlists, subtitle/data streams and unsupported codecs are rejected.
  Attached cover art may exist in the source but is never decoded or forwarded.
  Apple editable QuickTime audio is not an input contract; export a rendered M4A.

The server checks magic bytes, container/codec, MIME, stream layout and full decode
to a null sink. Client duration/codec metadata is not trusted. Decode progress must
match the declared duration. Stored `metadata.audio` contains verified information;
the additive `AssetDto.audio` projection exposes it without storage keys.

## Processing

`src/shared/media/audio-processor.ts` provides inspect, convert and sequential chunk
operations. Conversion outputs MP3, PCM16 WAV, FLAC or Ogg/Opus. Channels and sample
rate remain unchanged where the target codec permits; Opus can require resampling.
Explicit transcription preprocessing produces mono/16 kHz FLAC chunks ≤60 seconds.
Only one chunk is handed to the consumer at a time; chunks are not saved as public
assets. Provider calls, prompt policy, retries and cost accounting belong to the
pipeline/provider layer, not the media processor.

FFmpeg runs without a shell, with fixed argument/codec/demuxer allowlists, file/pipe
protocols only, and external MOV references disabled. Input filenames never come
from the request. Decode jobs use one thread, bounded metadata/output, a 20-second
probe timeout, and a 120-second processing timeout. At most two processing operations
and two multipart uploads run concurrently per process. Cancellation terminates the
child; finally blocks remove only the operation's own temporary directory.

The production Docker image installs FFmpeg/ffprobe. Native development also needs
both programs in PATH, or absolute server-only `FFMPEG_PATH` / `FFPROBE_PATH` values.
Missing tools return `audio_processor_unavailable`; there is no silent bypass.

## Studio session upload

`POST /api/assets/audio`, multipart fields:

- `file` — audio file;
- `workspaceId` and optional `documentId` — validated against the authenticated user;
- `origin` — `uploaded` or `saved`.

Browser Origin must match the configured trusted origins. Response: `201 {asset}`.
The normal authenticated asset content endpoint supports a single HTTP byte Range
for seeking (`206`, invalid range `416`). Uploading does not grant anonymous access.
The Library audio-management interface is outside this slice.

## Runtime client upload

`POST /v2/runtime/assets/audio`, Bearer authentication, multipart `file` only.
Workspace, audit attribution and client identity are resolved on the server; a
caller-supplied Workspace/document/storage path is rejected.

This requires the separate `pipeline.asset.write` scope. It is not in default
scopes, does not follow from artifact-read/grant-management rights, and is not
silently added to existing clients or keys. For the initial release, create a new
connection with this permission selected explicitly; existing client scope editing
is a separate administrative feature, not an implicit key-rotation side effect.

Optional `Idempotency-Key` makes upload retries return the same client-scoped asset.
Different bytes under the same key are rejected with `409 idempotency_conflict`.
Rotation within that client does not change the upload identity. Without the header,
each upload creates a separate asset.

Response: `201 {artifact, audio}`. The artifact contains `kind: audio`, `assetId`,
`mimeType`, `sizeBytes`, `checksumSha256` and `durationSeconds`. It contains no public
URL or S3 path. Pass that artifact into a published audio input. A completed run's
declared audio outputs use the existing protected Runtime artifact-download route.
Do not pass service credentials to browsers, mobile clients or Telegram.

## Migration and verification

Migration `0026` adds the audio media kind without changing existing image/video
records. It also closes the SQL NULL loophole in the Runtime snapshot revision
constraint: Runtime runs require an explicitly non-null positive grant revision.
Apply the migration before starting audio-capable application/worker processes.

Policy/storage/API tests run without media tools. The mandatory real codec gate is:

```sh
AUDIO_CODEC_TESTS_REQUIRED=1 node --experimental-strip-types \
  --loader ./scripts/node-test-loader.mjs --test \
  src/shared/media/audio-processor.test.ts
```

It must pass without skipped codec tests in the actual FFmpeg-enabled environment.
The PostgreSQL/MinIO integration gate must additionally prove Workspace isolation,
scope denial, private upload, protected download and stable upload retries. No paid
model invocation is necessary to validate this infrastructure.
