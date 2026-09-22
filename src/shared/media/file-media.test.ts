import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { streamMediaFile } from './media-source';
import { inspectVideoBytes, extractVideoPosterFrame, deriveVideoBytes } from './video-processor';
import { analyzeTimelineVideo } from './timeline-processor';
import { renderMontage } from './montage-render';
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const codecs = spawnSync(ffmpeg, ['-version']).status === 0;
test('129 MiB input stays file-backed through inspection, scene analysis, poster, trim and montage render', { skip: !codecs, timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'file-media-test-'));
  try {
    const original = join(directory, 'source.mp4');
    const run = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', original]);
    assert.equal(run.status, 0, run.stderr.toString());
    // A legal trailing MP4 free atom makes a large input without allocating a large buffer.
    const size = (await stat(original)).size, targetSize = 129 * 1024 * 1024;
    const handle = await open(original, 'r+');
    try { const header = Buffer.alloc(8); header.writeUInt32BE(targetSize - size); header.write('free', 4); await handle.write(header, 0, 8, size); await handle.truncate(targetSize); } finally { await handle.close(); }
    const before = process.memoryUsage().rss;
    const source = await streamMediaFile(createReadStream(original), join(directory, 'download'), targetSize);
    assert.equal(source.byteLength, targetSize); assert.equal(source.header.length, 4096);
    assert.ok(process.memoryUsage().rss - before < 96 * 1024 * 1024, 'stream must not retain a source-sized buffer');
    const inspected = await inspectVideoBytes(source, { maxBytes: 1024 ** 3 }); assert.equal(inspected.bytes, source);
    assert.equal(inspected.video.width, 160); assert.equal(inspected.byteSize, targetSize);
    assert.ok((await extractVideoPosterFrame(source)).byteLength > 0);
    const scenes = await analyzeTimelineVideo({ bytes: source }); assert.equal(scenes.shots.length, 1);
    const trimmed = await deriveVideoBytes({ bytes: source, options: { kind: 'trim', range: { startMs: 100, endMs: 600 } } });
    assert.ok('video' in trimmed && Math.abs(trimmed.video.durationSeconds - 0.5) < 0.1);
    const rendered = await renderMontage({ aspectRatio: '16:9', clips: [{ assetId: 'source', kind: 'video', sourceInMs: 100, durationMs: 500 }] }, async () => ({ bytes: source, video: inspected.video }), AbortSignal.timeout(30_000));
    assert.ok(Math.abs(rendered.video.durationSeconds - 0.5) < 0.1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
