import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { videoDeriveOptionsSchema, videoTrimRangeSchema } from './video-contracts';
import { deriveVideoBytes, inspectVideoBytes } from './video-processor';
import { analyzeTimelineVideo } from './timeline-processor';
import type { TimelineAnalysisProgress } from './timeline-progress';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !available && process.env.VIDEO_CODEC_TESTS_REQUIRED !== '1';
test('trim requires a finite positive interval and cannot combine spatial and temporal operations', () => {
  assert.equal(videoTrimRangeSchema.safeParse({ startMs: 0, endMs: 1000 }).success, true);
  for (const range of [{ startMs: -1, endMs: 1000 }, { startMs: 1000, endMs: 1000 }, { startMs: 2000, endMs: 1000 }, { startMs: 0, endMs: Infinity }]) assert.equal(videoTrimRangeSchema.safeParse(range).success, false);
  for (const options of [{ kind: 'trim' }, { kind: 'preview', range: { startMs: 0, endMs: 1000 } }, { kind: 'trim', range: { startMs: 0, endMs: 1000 }, crop: { x: 0, y: 0, width: 1, height: 1 } }]) assert.equal(videoDeriveOptionsSchema.safeParse(options).success, false);
});

test('real trim exports only the chosen blue interval with audio, preserves source and reports decoded analysis progress', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required video codec gate.');
  const directory = await mkdtemp(join(tmpdir(), 'video-trim-codec-'));
  try {
    const sourcePath = join(directory, 'source.mp4');
    const encoded = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', "color=c=red:s=160x120:r=10:d=4,drawbox=x=0:y=0:w=160:h=120:color=blue:t=fill:enable='gte(t,2)'",
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=3',
      '-map', '0:v:0', '-map', '1:a:0', '-map', '2:a:0', '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sourcePath], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(encoded.status, 0, encoded.stderr);
    const bytes = new Uint8Array(await readFile(sourcePath)); const snapshot = Buffer.from(bytes);
    const original = await inspectVideoBytes(bytes);
    const result = await deriveVideoBytes({ bytes, options: { kind: 'trim', range: { startMs: 2000, endMs: 3000 } } });
    assert.ok('video' in result); assert.equal(result.video.browserPlayable, true); assert.equal(result.video.codec, 'h264');
    assert.ok(Math.abs(result.video.durationSeconds - 1) < 0.1); assert.ok(Math.abs(result.video.audioTracks[0]!.durationSeconds! - 1) < 0.1);
    const outputPath = join(directory, 'trim.mp4'); await writeFile(outputPath, result.bytes);
    const pixel = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', outputPath, '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { timeout: 30_000 });
    assert.equal(pixel.status, 0); assert.ok(pixel.stdout[2]! > 200 && pixel.stdout[0]! < 20, 'Trim must start with blue pixels, not the source opening.');
    const shortTrack = await deriveVideoBytes({ bytes, options: { kind: 'trim', range: { startMs: 3000, endMs: 4000 }, audioTrackIndex: original.video.audioTracks[1]!.index } });
    assert.ok('video' in shortTrack); assert.deepEqual(shortTrack.video.audioTracks, []);
    const delayedPath = join(directory, 'delayed.mp4');
    const delayedFixture = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', sourcePath, '-itsoffset', '2', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=1.2',
      '-map', '0:v:0', '-map', '1:a:0', '-threads', '1', '-c:v', 'copy', '-c:a', 'aac', delayedPath], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(delayedFixture.status, 0, delayedFixture.stderr);
    const delayed = await deriveVideoBytes({ bytes: new Uint8Array(await readFile(delayedPath)), options: { kind: 'trim', range: { startMs: 2000, endMs: 3000 } } });
    assert.ok('video' in delayed); assert.equal(delayed.video.audioTracks.length, 1); assert.ok(Math.abs(delayed.video.audioTracks[0]!.durationSeconds! - 1) < 0.1);
    await assert.rejects(deriveVideoBytes({ bytes, options: { kind: 'trim', range: { startMs: 3000, endMs: 5000 } } }), { code: 'invalid_video_trim' });
    const controller = new AbortController(); controller.abort(new Error('cancel trim'));
    await assert.rejects(deriveVideoBytes({ bytes, options: { kind: 'trim', range: { startMs: 0, endMs: 1000 } }, signal: controller.signal }), /cancel trim/);
    assert.deepEqual(Buffer.from(bytes), snapshot);
    const progress: TimelineAnalysisProgress[] = [];
    const analysis = await analyzeTimelineVideo({ bytes, onProgress: async (value) => { progress.push(value); } });
    assert.deepEqual(progress.filter((value, index) => index === 0 || value.phase !== progress[index - 1]!.phase).map((value) => value.phase), ['indexing', 'detecting', 'finalizing']);
    assert.equal(progress.at(-1)?.processedFrames, analysis.frameTimesMs.length); assert.equal(progress.at(-1)?.processedMs, analysis.durationMs);
    assert.equal(progress[0]?.estimatedRemainingMs, null); assert.equal(analysis.shots.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
