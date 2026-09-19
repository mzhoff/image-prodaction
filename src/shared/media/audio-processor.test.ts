import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { convertAudioBytes, forEachAudioChunk, inspectAudioBytes } from './audio-processor';
import { runAudioProgram, withAudioWork } from './audio-process';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const skip = !available && process.env.AUDIO_CODEC_TESTS_REQUIRED !== '1';
// Other test files run in parallel processes; their temporary files are not leaks here.
const originalTmpdir = process.env.TMPDIR;
const suiteTmpdir = await mkdtemp(join(tmpdir(), 'image-production-codec-suite-'));
process.env.TMPDIR = suiteTmpdir;
after(async () => {
  if (originalTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmpdir;
  await rm(suiteTmpdir, { recursive: true, force: true });
});

function wav(seconds = 2, channels = 1) {
  const sampleRate = 16000;
  const payload = Math.floor(seconds * sampleRate) * 2 * channels;
  const bytes = Buffer.alloc(44 + payload);
  bytes.write('RIFF'); bytes.writeUInt32LE(36 + payload, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2 * channels, 28);
  bytes.writeUInt16LE(2 * channels, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(payload, 40);
  for (let i = 0; i < payload / 2; i += 1) bytes.writeInt16LE(Math.round(Math.sin(i / channels * Math.PI * 440 / sampleRate) * 12000), 44 + i * 2);
  return bytes;
}

test('real codecs: probe and convert WAV to MP3/FLAC/Opus, retaining verified metadata', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required codec gate.');
  const original = await inspectAudioBytes(wav());
  assert.equal(original.audio.codec, 'pcm_s16le'); assert.equal(original.audio.channels, 1);
  assert.equal(original.audio.durationSeconds, 2);
  for (const format of ['mp3', 'wav', 'flac', 'ogg'] as const) {
    const converted = await convertAudioBytes({ bytes: original.bytes, options: { format } });
    assert.equal(converted.audio.container, format);
    assert.equal(converted.audio.channels, 1);
    assert.ok(Math.abs(converted.audio.durationSeconds - 2) < 0.2);
    const checked = await inspectAudioBytes(converted.bytes, { claimedContentType: converted.contentType });
    assert.equal(checked.checksumSha256, converted.checksumSha256);
  }
});

test('real codecs: AAC ADTS, AAC/ALAC M4A and Vorbis Ogg decode safely', { skip, timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audio-codec-fixture-'));
  try {
    const source = join(directory, 'source.wav'); await writeFile(source, wav());
    for (const [codec, format, expected] of [['aac', 'adts', 'aac'], ['aac', 'ipod', 'm4a'], ['alac', 'ipod', 'm4a'], ['libvorbis', 'ogg', 'ogg']] as const) {
      const target = join(directory, `fixture-${codec}-${format}`);
      const result = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', source, '-c:a', codec, '-f', format, target], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const inspected = await inspectAudioBytes(new Uint8Array(await readFile(target)));
      assert.equal(inspected.audio.container, expected);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real codecs: sequential chunk callback, channels/duration rejection and cleanup after callback failure', { skip, timeout: 120_000 }, async () => {
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('image-production-audio-')));
  const seen: number[] = [];
  await assert.rejects(forEachAudioChunk({ bytes: wav(3, 2), chunkDurationSeconds: 1 }, async (chunk) => {
    seen.push(chunk.index);
    assert.equal(chunk.contentType, 'audio/flac'); assert.equal(Buffer.from(chunk.bytes).toString('ascii', 0, 4), 'fLaC');
    if (chunk.index === 1) throw new Error('consumer failed');
  }), /consumer failed/);
  assert.deepEqual(seen, [0, 1]);
  await assert.rejects(inspectAudioBytes(wav(2, 3)), { code: 'unsupported_audio_parameters' });
  await assert.rejects(inspectAudioBytes(wav(2), { maxDurationSeconds: 1 }), { code: 'audio_duration_limit' });
  const after = (await readdir(tmpdir())).filter((name) => name.startsWith('image-production-audio-') && !before.has(name));
  assert.deepEqual(after, []);
});

test('processor rejects unsafe binary config and cancels a running child', { timeout: 10_000 }, async () => {
  const original = process.env.FFMPEG_PATH;
  try {
    process.env.FFMPEG_PATH = 'relative/path';
    await assert.rejects(withAudioWork(wav(), undefined, async (directory) => runAudioProgram('ffmpeg', [], directory)), { code: 'audio_processor_unavailable' });
    process.env.FFMPEG_PATH = process.execPath;
    const abort = new AbortController();
    const operation = withAudioWork(wav(), abort.signal, async (directory) => {
      setTimeout(() => abort.abort(new Error('test cancellation')), 100);
      return runAudioProgram('ffmpeg', ['-e', 'setInterval(()=>{},1000)'], directory, abort.signal);
    });
    await assert.rejects(operation, /test cancellation/);
  } finally { if (original === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = original; }
});
