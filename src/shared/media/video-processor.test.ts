import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deriveVideoBytes, extractVideoPosterFrame, inspectVideoBytes } from './video-processor';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !available && process.env.VIDEO_CODEC_TESTS_REQUIRED !== '1';

async function fixture(directory: string, format: 'mp4' | 'mov' | 'webm', options: { silent?: boolean; secondTrack?: boolean; codec?: string; audioChannels?: number } = {}) {
  const path = join(directory, `fixture-${format}-${options.codec ?? 'default'}-${options.silent ?? false}-${options.secondTrack ?? false}-${options.audioChannels ?? 1}.${format}`);
  const args = ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=10:duration=2',
    ...(options.silent ? [] : ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2']),
    ...(options.secondTrack ? ['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2'] : []),
    '-map', '0:v:0', ...(options.silent ? [] : ['-map', '1:a:0']), ...(options.secondTrack ? ['-map', '2:a:0'] : []),
    '-threads', '1', '-c:v', options.codec ?? (format === 'webm' ? 'libvpx-vp9' : 'libx264'), '-pix_fmt', 'yuv420p',
    ...(options.silent ? [] : ['-c:a', format === 'webm' ? 'libopus' : 'aac', '-ac', String(options.audioChannels ?? 1)]), '-t', '2', '-f', format, path];
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return new Uint8Array(await readFile(path));
}

test('real codecs: MP4 immutable original, separate lossless AAC and silent picture with matching duration', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required video codec gate.');
  const directory = await mkdtemp(join(tmpdir(), 'video-codec-fixture-'));
  try {
    const bytes = await fixture(directory, 'mp4'); const snapshot = Buffer.from(bytes);
    const original = await inspectVideoBytes(bytes, { claimedContentType: 'video/mp4' });
    assert.equal(original.video.browserPlayable, true); assert.equal(original.video.audioTracks.length, 1);
    const poster = await extractVideoPosterFrame(bytes);
    assert.deepEqual([...poster.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const audio = await deriveVideoBytes({ bytes, options: { kind: 'audio' } });
    assert.ok('audio' in audio); assert.equal(audio.audio.codec, 'aac'); assert.equal(audio.extension, 'm4a');
    const silent = await deriveVideoBytes({ bytes, options: { kind: 'video-only' } });
    assert.ok('video' in silent); assert.equal(silent.video.audioTracks.length, 0); assert.equal(silent.video.codec, original.video.codec);
    assert.ok(Math.abs(silent.video.durationSeconds - original.video.durationSeconds) < 0.2);
    assert.deepEqual(Buffer.from(bytes), snapshot);
    await assert.rejects(deriveVideoBytes({ bytes: silent.bytes, options: { kind: 'audio' } }), { code: 'video_has_no_audio' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('real codecs: multichannel WebM without stream duration measures the track before bounded FLAC conversion', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-codec-fixture-'));
  try {
    const bytes = await fixture(directory, 'webm', { audioChannels: 6 });
    const source = await inspectVideoBytes(bytes);
    assert.equal(source.video.audioTracks[0]?.channels, 6);
    assert.equal(source.video.audioTracks[0]?.durationSeconds, undefined);
    const audio = await deriveVideoBytes({ bytes, options: { kind: 'audio' } });
    assert.ok('audio' in audio); assert.equal(audio.audio.container, 'flac'); assert.equal(audio.audio.channels, 2);
    assert.ok(Math.abs(audio.audio.durationSeconds - 2) < 0.1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('real codecs: MOV browser preview, multiple audio tracks and WebM/Opus', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-codec-fixture-'));
  try {
    const bytes = await fixture(directory, 'mov', { secondTrack: true, codec: 'mpeg4' });
    const original = await inspectVideoBytes(bytes); assert.equal(original.video.audioTracks.length, 2); assert.equal(original.video.browserPlayable, false);
    const audio = await deriveVideoBytes({ bytes, options: { kind: 'audio', audioTrackIndex: original.video.audioTracks[1]!.index } });
    assert.ok('audio' in audio);
    const preview = await deriveVideoBytes({ bytes, options: { kind: 'preview' } });
    assert.ok('video' in preview); assert.equal(preview.video.browserPlayable, true); assert.equal(preview.video.audioTracks.length, 1);
    await assert.rejects(deriveVideoBytes({ bytes, options: { kind: 'audio', audioTrackIndex: 31 } }), { code: 'video_audio_track_not_found' });
    const webm = await fixture(directory, 'webm'); const webmOriginal = await inspectVideoBytes(webm);
    assert.equal(webmOriginal.video.container, 'webm');
    const opus = await deriveVideoBytes({ bytes: webm, options: { kind: 'audio' } });
    assert.ok('audio' in opus); assert.equal(opus.audio.codec, 'opus'); assert.equal(opus.extension, 'ogg');
    const noAudio = await fixture(directory, 'mp4', { silent: true }); assert.equal((await inspectVideoBytes(noAudio)).video.audioTracks.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
