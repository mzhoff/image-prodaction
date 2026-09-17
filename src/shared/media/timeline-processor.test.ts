import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { analyzeTimelineVideo, buildTimelineShots, extractTimelineFrameBytes, parseTimelineFrames, parseTimelineScores, withTimelineFrameReader } from './timeline-processor';

test('decoded PTS preserve nonuniform frame intervals and normalize a nonzero source start', () => {
  const result = parseTimelineFrames({ frames: [
    { best_effort_timestamp_time: '5.000', pkt_duration_time: '0.040' },
    { best_effort_timestamp_time: '5.040', pkt_duration_time: '0.120' },
    { best_effort_timestamp_time: '5.160', pkt_duration_time: '0.040' },
  ] }, 5, 200);
  assert.deepEqual(result, { durationMs: 200, frameTimesMs: [0, 40, 160] });
  assert.throws(() => parseTimelineFrames({ frames: [{ pts_time: '0' }, { pts_time: '0' }] }, 0, 100));
  assert.throws(() => parseTimelineFrames({ frames: [{ pts_time: '301' }] }, 0, 302000));
  assert.throws(() => parseTimelineFrames({ frames: [{ pts_time: '0' }] }, 0, 0));
});

test('frame score parser requires every decoded frame and ignores unknown metadata', () => {
  const scores = parseTimelineScores('frame:0 pts:0 pts_time:0\nlavfi.scd.score=0\nframe:0 pts:0 pts_time:0\nlavfi.signalstats.YAVG=20\nframe:1 pts:1 pts_time:1\nlavfi.scd.score=40\n', 2);
  assert.deepEqual(scores.get(0), { score: 0, brightness: 20 }); assert.equal(scores.get(1)?.score, 40);
  assert.throws(() => parseTimelineScores('frame:0 pts:0\nlavfi.scd.score=0\n', 2));
});

test('detected shots cover source exactly and representative images avoid dark boundaries when possible', () => {
  const frameTimesMs = Array.from({ length: 20 }, (_, index) => index * 100);
  const scores = new Map(frameTimesMs.map((_, index) => [index, { score: index === 10 ? 70 : 0, brightness: index === 5 ? 0 : 100 }]));
  const shots = buildTimelineShots({ durationMs: 2000, frameTimesMs }, scores);
  assert.deepEqual(shots.map(({ startMs, endMs }) => [startMs, endMs]), [[0, 1000], [1000, 2000]]);
  assert.equal(shots[0]!.frameTimesMs[0], 400); assert.equal(shots[1]!.frameTimesMs[0], 1500);
  assert.throws(() => buildTimelineShots({ durationMs: 1, frameTimesMs: [0] }, new Map(), Number.NaN));
  const crowded = Array.from({ length: 101 }, (_, index) => index * 10);
  assert.throws(() => buildTimelineShots({ durationMs: 1010, frameTimesMs: crowded }, new Map(crowded.map((_, index) => [index, { score: 90 }]))), { code: 'timeline_shot_limit' });
});

test('bad files, out-of-range frame requests, and invalid sensitivity fail before native processing', async () => {
  await assert.rejects(analyzeTimelineVideo({ bytes: new Uint8Array(1), threshold: 200 }), { code: 'invalid_timeline_threshold' });
  await assert.rejects(analyzeTimelineVideo({ bytes: new Uint8Array(1) }), { code: 'unsupported_video' });
  await assert.rejects(extractTimelineFrameBytes({ bytes: new Uint8Array(1), timeMs: -1 }), { code: 'invalid_timeline_frame' });
});

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'; const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !available && process.env.TIMELINE_CODEC_TESTS_REQUIRED !== '1';
function encode(args: string[]) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || 'Install ffmpeg and ffprobe for required codec tests.');
}

test('real codec: hard cuts, exact stills, nonzero start, unchanged source and cancellation', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true);
  const directory = await mkdtemp(join(tmpdir(), 'timeline-codec-fixture-'));
  try {
    const file = join(directory, 'cuts.mp4');
    encode(['-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=10:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=10:d=1',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '4', file]);
    const bytes = new Uint8Array(await readFile(file)); const before = Buffer.from(bytes);
    const analysis = await analyzeTimelineVideo({ bytes });
    assert.equal(analysis.durationMs, 2000); assert.deepEqual(analysis.frameTimesMs, Array.from({ length: 20 }, (_, index) => index * 100));
    assert.deepEqual(analysis.shots.map((shot) => [shot.startMs, shot.endMs]), [[0, 1000], [1000, 2000]]);
    const red = await extractTimelineFrameBytes({ bytes, timeMs: 900 }); const blue = await extractTimelineFrameBytes({ bytes, timeMs: 1000 });
    const redStats = await sharp(red).stats(); const blueStats = await sharp(blue).stats();
    assert.ok(redStats.channels[0]!.mean > 200 && redStats.channels[2]!.mean < 30);
    assert.ok(blueStats.channels[2]!.mean > 200 && blueStats.channels[0]!.mean < 30);
    await withTimelineFrameReader({ bytes }, async (readFrame) => {
      await readFrame(900);
      // Inside the last frame's duration, but no decoded frame starts after 1.999s.
      // FFmpeg's empty successful output must NOT return the previous red JPEG.
      await assert.rejects(readFrame(1999), { code: 'invalid_timeline_frame' });
      const resumed = await sharp(await readFrame(1000)).stats();
      assert.ok(resumed.channels[2]!.mean > 200 && resumed.channels[0]!.mean < 30);
    });
    assert.deepEqual(Buffer.from(bytes), before);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(analyzeTimelineVideo({ bytes, signal: abort.signal }), { name: 'AbortError' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real codec: VFR timestamps are decoded and rotation applies to extracted real frame', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'timeline-codec-fixture-'));
  try {
    const file = join(directory, 'vfr.mp4'); const rotated = join(directory, 'rotated.mp4');
    encode(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=10:duration=2', '-vf', "select='eq(mod(n,3),0)+eq(n,19)'", '-fps_mode', 'vfr', '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
    // Modern FFmpeg uses display-matrix side data; a textual rotate tag is not sufficient.
    encode(['-display_rotation', '90', '-i', file, '-c', 'copy', rotated]);
    const probe = spawnSync(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', rotated], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(probe.status, 0, probe.stderr);
    const metadata = JSON.parse(probe.stdout) as { streams: Array<{ side_data_list?: Array<{ rotation?: number }> }> };
    assert.equal(Math.abs(metadata.streams[0]?.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? 0), 90, 'Fixture must actually contain a rotation display matrix.');
    const bytes = new Uint8Array(await readFile(rotated)); const analysis = await analyzeTimelineVideo({ bytes, threshold: 60 });
    assert.deepEqual(analysis.frameTimesMs, [0, 300, 600, 900, 1200, 1500, 1800, 1900]);
    const image = await sharp(await extractTimelineFrameBytes({ bytes, timeMs: 1200 })).metadata();
    assert.equal(image.width, 120); assert.equal(image.height, 160);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
