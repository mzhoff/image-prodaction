import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { videoCropSchema, videoDeriveOptionsSchema } from './video-contracts';
import { getVideoDisplayDimensions, resolveVideoCropPixels } from './video-crop';
import { deriveVideoBytes, inspectVideoBytes } from './video-processor';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !available && process.env.VIDEO_CODEC_TESTS_REQUIRED !== '1';

test('crop and API-extended derivation schema share strict normalized bounds and kind refinements', () => {
  const crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  assert.equal(videoCropSchema.safeParse(crop).success, true);
  for (const invalid of [{ ...crop, x: -1 }, { ...crop, width: 0 }, { ...crop, width: Infinity }, { ...crop, x: 0.9 }, { ...crop, y: 0.1 }, { ...crop, filter: 'arbitrary' }]) {
    assert.equal(videoCropSchema.safeParse(invalid).success, false);
  }
  const routeSchema = videoDeriveOptionsSchema.safeExtend({});
  assert.equal(routeSchema.safeParse({ kind: 'crop', crop }).success, true);
  for (const invalid of [{ kind: 'crop' }, { kind: 'preview', crop }, { kind: 'video-only', audioTrackIndex: 1 }, { kind: 'crop', crop, audioTrackIndex: -1 }]) {
    assert.equal(routeSchema.safeParse(invalid).success, false);
  }
});

test('crop resolves displayed rotation to bounded even pixels without stretching or tiny output', () => {
  const picture = { width: 161, height: 121, rotationDegrees: 0 };
  assert.deepEqual(resolveVideoCropPixels(picture, { x: 0, y: 0, width: 1, height: 1 }), { x: 0, y: 0, width: 160, height: 120 });
  assert.deepEqual(getVideoDisplayDimensions({ ...picture, rotationDegrees: -90 }), { width: 121, height: 161 });
  const crop = resolveVideoCropPixels({ ...picture, rotationDegrees: 90 }, { x: 0.5, y: 0, width: 0.5, height: 1 });
  assert.deepEqual(crop, { x: 60, y: 0, width: 60, height: 160 });
  assert.throws(() => resolveVideoCropPixels(picture, { x: 0, y: 0, width: 0.001, height: 1 }), { code: 'invalid_video_crop' });
  assert.throws(() => getVideoDisplayDimensions({ ...picture, rotationDegrees: 45 }), { code: 'unsupported_video_rotation' });
});

function run(args: string[]) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
}

async function fixture(directory: string, options: { silent?: boolean; rotate?: boolean; webm?: boolean } = {}) {
  const extension = options.webm ? 'webm' : 'mp4';
  const path = join(directory, `fixture.${extension}`);
  run(['-f', 'lavfi', '-i', "color=c=red:s=160x120:r=10:d=2,drawbox=x=80:y=0:w=80:h=120:color=blue:t=fill",
    ...(options.silent ? [] : ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=1']),
    '-map', '0:v:0', ...(options.silent ? [] : ['-map', '1:a:0', '-map', '2:a:0']), '-threads', '1', '-c:v', options.webm ? 'libvpx-vp9' : 'libx264', '-pix_fmt', 'yuv420p',
    ...(options.silent ? [] : ['-c:a', options.webm ? 'libopus' : 'aac', '-disposition:a:0', '0', '-disposition:a:1', 'default']), path]);
  if (!options.rotate) return new Uint8Array(await readFile(path));
  const rotated = join(directory, 'rotated.mp4');
  run(['-display_rotation:v:0', '90', '-i', path, '-map', '0', '-c', 'copy', rotated]);
  return new Uint8Array(await readFile(rotated));
}

async function averageColor(bytes: Uint8Array, directory: string) {
  const target = join(directory, 'cropped.mp4');
  await writeFile(target, bytes);
  const frame = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', target, '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { timeout: 30_000 });
  assert.equal(frame.status, 0, frame.stderr?.toString());
  return [...frame.stdout];
}

test('real crop: right half creates MP4 pixels, preserves immutable source and only default audio without padding', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required video codec gate.');
  const directory = await mkdtemp(join(tmpdir(), 'video-crop-codec-'));
  try {
    const bytes = await fixture(directory); const snapshot = Buffer.from(bytes);
    const source = await inspectVideoBytes(bytes);
    assert.equal(source.video.audioTracks.length, 2);
    const result = await deriveVideoBytes({ bytes, options: { kind: 'crop', crop: { x: 0.5, y: 0, width: 0.5, height: 1 } } });
    assert.ok('video' in result);
    assert.equal(result.contentType, 'video/mp4'); assert.equal(result.video.codec, 'h264'); assert.equal(result.video.browserPlayable, true);
    assert.deepEqual([result.video.width, result.video.height], [80, 120]);
    assert.equal(result.video.audioTracks.length, 1);
    assert.ok(Math.abs(result.video.audioTracks[0]!.durationSeconds! - 1) < 0.1, 'Default shorter track must not be padded to two seconds.');
    assert.ok(Math.abs(result.video.pictureDurationSeconds! - 2) < 0.1);
    const [red, , blue] = await averageColor(result.bytes, directory);
    assert.ok(blue! > 200 && red! < 20, `Expected actual blue-half pixels, got red=${red}, blue=${blue}.`);
    assert.deepEqual(Buffer.from(bytes), snapshot);
    const selected = await deriveVideoBytes({ bytes, options: { kind: 'crop', crop: { x: 0, y: 0, width: 0.5, height: 1 }, audioTrackIndex: source.video.audioTracks[0]!.index } });
    assert.ok('video' in selected); assert.ok(Math.abs(selected.video.audioTracks[0]!.durationSeconds! - 2) < 0.1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real crop: rotated picture uses visible coordinates and silent video stays silent', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-crop-codec-'));
  try {
    const bytes = await fixture(directory, { silent: true, rotate: true });
    const source = await inspectVideoBytes(bytes); assert.equal(Math.abs(source.video.rotationDegrees), 90);
    const result = await deriveVideoBytes({ bytes, options: { kind: 'crop', crop: { x: 0, y: 0, width: 1, height: 0.5 } } });
    assert.ok('video' in result);
    assert.deepEqual([result.video.width, result.video.height, result.video.rotationDegrees], [120, 80, 0]);
    assert.deepEqual(result.video.audioTracks, []);
    const [red, , blue] = await averageColor(result.bytes, directory);
    assert.ok(blue! > 200 && red! < 20, 'Autorotated top half must contain the original right-hand blue pixels.');
    const controller = new AbortController(); controller.abort(new Error('cancel crop'));
    await assert.rejects(deriveVideoBytes({ bytes, options: { kind: 'crop', crop: { x: 0, y: 0, width: 1, height: 1 } }, signal: controller.signal }), /cancel crop/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real crop: WebM Opus converts to playable MP4 and preserves the selected audio duration', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-crop-codec-'));
  try {
    const bytes = await fixture(directory, { webm: true });
    const result = await deriveVideoBytes({ bytes, options: { kind: 'crop', crop: { x: 0.25, y: 0, width: 0.5, height: 1 } } });
    assert.ok('video' in result); assert.equal(result.video.browserPlayable, true); assert.equal(result.video.audioTracks[0]?.codec, 'aac');
    assert.ok(Math.abs(result.video.audioTracks[0]!.durationSeconds! - 1) < 0.1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
