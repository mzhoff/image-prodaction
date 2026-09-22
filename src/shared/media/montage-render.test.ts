import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { renderMontage } from './montage-render';
import { inspectVideoBytes } from './video-processor';
import { analyzeMusicBytes } from './music-processor';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = [ffmpeg, ffprobe].every((p) => spawnSync(p, ['-version'], { stdio: 'ignore' }).status === 0);
const skip = !available && process.env.VIDEO_CODEC_TESTS_REQUIRED !== '1';
function run(args: string[]) {
  const result = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout;
}
test('real montage: trims/reorders original, inserts delayed music, preserves silence and concurrent renders finish', { skip, timeout: 120000 }, async () => {
  assert.ok(available);
  const directory = await mkdtemp(join(tmpdir(), 'montage-fixture-'));
  try {
    const videoPath = join(directory, 'source.mp4'), audioPath = join(directory, 'music.wav');
    run(['-f', 'lavfi', '-i', 'color=red:size=160x90:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=160x90:rate=30:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoPath]);
    run(['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=6', '-c:a', 'pcm_s16le', audioPath]);
    const video = await inspectVideoBytes(await readFile(videoPath)), audio = await readFile(audioPath), original = Buffer.from(video.bytes);
    const picture = await sharp({ create: { width: 90, height: 160, channels: 3, background: '#00ff00' } }).gif().toBuffer();
    const load = async (id: string) => id === 'video' ? { bytes: video.bytes, video: video.video } : { bytes: id === 'audio' ? audio : picture };
    const [result, image] = await Promise.all([
      renderMontage({ aspectRatio: '16:9', frameRate: 30, sourceAudioGain: 1,
        clips: [{ sourceAudioMuted: true, assetId: 'video', kind: 'video', sourceInMs: 1000, durationMs: 500 }, { sourceAudioMuted: true, assetId: 'video', kind: 'video', sourceInMs: 0, durationMs: 500 }],
        audioClips: [{ assetId: 'audio', startMs: 250, sourceInMs: 1000, durationMs: 500, gain: 1 }] }, load, AbortSignal.timeout(60000)),
      renderMontage({ aspectRatio: '9:16', frameRate: 24, clips: [{ assetId: 'image', kind: 'image', sourceInMs: 0, durationMs: 500 }] }, load, AbortSignal.timeout(60000)),
    ]);
    assert.equal(result.video.width, 1280); assert.equal(result.video.height, 720); assert.equal(result.video.codec, 'h264');
    assert.equal(result.video.audioTracks[0].codec, 'aac'); assert.ok(Math.abs(result.video.durationSeconds - 1) < 0.05);
    assert.equal(image.video.width, 720); assert.equal(image.video.height, 1280); assert.deepEqual(Buffer.from(video.bytes), original);
    const resultPath = join(directory, 'result.mp4'); await writeFile(resultPath, result.bytes);
    for (const [time, channel] of [[0.1, 2], [0.8, 0]]) {
      const rgb = run(['-ss', String(time), '-i', resultPath, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
      assert.ok(rgb[channel] > 200, `Expected color channel ${channel} at ${time}s: ${rgb.toString('hex')}`);
    }
    const pcm = run(['-i', resultPath, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    const rms = (start: number, end: number) => { let sum = 0; for (let i = start * 8000; i < end * 8000; i++) sum += (pcm.readInt16LE(i * 2) / 32768) ** 2; return Math.sqrt(sum / ((end - start) * 8000)); };
    assert.ok(rms(0.01, 0.15) < 0.001); assert.ok(rms(0.35, 0.6) > 0.03); assert.ok(rms(0.85, 0.95) < 0.001);
    const rhythm = await analyzeMusicBytes({ bytes: audio, sourceInMs: 1000, durationMs: 5000, bpm: 120, beatOffsetMs: 100, signal: AbortSignal.timeout(30000) });
    assert.equal(rhythm.beatsMs[0], 100); assert.equal(rhythm.beatsMs.length, 10);
    const many = await renderMontage({ aspectRatio: '1:1', frameRate: 24, sourceAudioGain: 0.5,
      clips: Array.from({ length: 20 }, () => ({ assetId: 'video', kind: 'video' as const, sourceInMs: 200, durationMs: 137 })) }, load, AbortSignal.timeout(60000));
    assert.ok(Math.abs(many.video.durationSeconds - 66 / 24) < 0.05, 'cumulative rounding must not drift across cuts');
    const manyPath = join(directory, 'many.mp4'); await writeFile(manyPath, many.bytes);
    const tail = run(['-ss', '2.5', '-i', manyPath, '-vn', '-t', '0.1', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    assert.ok(tail.length >= 1500); assert.ok([...Array(tail.length / 2)].some((_, i) => Math.abs(tail.readInt16LE(i * 2)) > 1000), 'original video sound remains audible at the end');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('visible layered segments render black gaps and full-frame overlays without loading fake assets', { skip, timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'montage-layers-'));
  try {
    const red = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const green = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const loaded: string[] = [];
    const result = await renderMontage({ aspectRatio: '1:1', frameRate: 30, clips: [
      { kind: 'gap', assetId: '', sourceInMs: 0, durationMs: 200 },
      { kind: 'image', assetId: 'red', sourceInMs: 0, durationMs: 400 },
      { kind: 'image', assetId: 'green', sourceInMs: 0, durationMs: 400 },
      { kind: 'image', assetId: 'red', sourceInMs: 0, durationMs: 200 },
    ] }, async (id) => { loaded.push(id); assert.ok(id); return { bytes: id === 'red' ? red : green }; }, AbortSignal.timeout(45000));
    assert.deepEqual(loaded, ['red', 'green', 'red']);
    const file = join(directory, 'layers.mp4'); await writeFile(file, result.bytes);
    for (const [time, channel] of [[0.1, -1], [0.3, 0], [0.8, 1], [1.1, 0]]) {
      const rgb = run(['-ss', String(time), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
      if (channel === -1) assert.ok([...rgb].every((value) => value < 5)); else assert.ok(rgb[channel] > 200);
    }
    assert.ok(Math.abs(result.video.durationSeconds - 1.2) < .04);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('short extracted sound ends in silence without shortening picture; cuts beyond the sound are silent', { skip, timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'montage-short-audio-'));
  try {
    const audioPath = join(directory, 'short.wav');
    run(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.4', '-c:a', 'pcm_s16le', audioPath]);
    const audio = await readFile(audioPath);
    const result = await renderMontage({ aspectRatio: '1:1', frameRate: 30,
      clips: [{ kind: 'gap', assetId: '', sourceInMs: 0, durationMs: 1200 }],
      audioClips: [{ assetId: 'sound', startMs: 0, sourceInMs: 0, durationMs: 700, gain: 1 },
        { assetId: 'sound', startMs: 700, sourceInMs: 700, durationMs: 500, gain: 1 }],
    }, async () => ({ bytes: audio }), AbortSignal.timeout(45000));
    assert.ok(Math.abs(result.video.durationSeconds - 1.2) < 0.04);
    const file = join(directory, 'result.mp4'); await writeFile(file, result.bytes);
    const pcm = run(['-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    const peak = (start: number, end: number) => Math.max(...Array.from({ length: Math.floor((end - start) * 8000) }, (_, i) => Math.abs(pcm.readInt16LE((Math.floor(start * 8000) + i) * 2))));
    assert.ok(peak(0.1, 0.3) > 1000); assert.ok(peak(0.6, 1.1) < 30);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
