import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assembleSpeechParts } from './speech-assembly';
import { wrapSpeechPcmAsWav } from './speech-wave';

const available = ['FFMPEG_PATH', 'FFPROBE_PATH'].every((key) => spawnSync(process.env[key] || (key === 'FFMPEG_PATH' ? 'ffmpeg' : 'ffprobe'), ['-version'], { stdio: 'ignore' }).status === 0);
const skip = !available && process.env.AUDIO_CODEC_TESTS_REQUIRED !== '1';
function speech(seconds: number, frequency: number, rate = 24_000) {
  const pcm = Buffer.alloc(seconds * rate * 2);
  for (let index = 0; index < pcm.length / 2; index += 1) pcm.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * frequency / rate) * 12_000), index * 2);
  return wrapSpeechPcmAsWav(pcm, rate);
}

test('real codec: speech parts with different rates join into one bounded mono MP3', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required codec gate.');
  const before = new Set(await readdir(tmpdir()));
  const result = await assembleSpeechParts({ parts: (async function* () { yield speech(1, 300, 16_000); yield speech(1, 600); })() });
  assert.equal(result.contentType, 'audio/mpeg'); assert.equal(result.audio.channels, 1);
  assert.equal(result.audio.sampleRateHz, 24_000); assert.ok(Math.abs(result.audio.durationSeconds - 2) < 0.2);
  assert.ok(result.bytes.length < 100_000);
  const leaked = (await readdir(tmpdir())).filter((name) => name.startsWith('image-production-speech-') && !before.has(name));
  assert.deepEqual(leaked, []);
});

test('real codec: provider failure after one part cleans local assembly without swallowing the failure', { skip, timeout: 120_000 }, async () => {
  assert.equal(available, true, 'Install ffmpeg/ffprobe for the required codec gate.');
  const before = new Set(await readdir(tmpdir()));
  await assert.rejects(assembleSpeechParts({ parts: (async function* () { yield speech(1, 300); throw new Error('provider outcome unknown'); })() }), /provider outcome unknown/);
  assert.deepEqual((await readdir(tmpdir())).filter((name) => name.startsWith('image-production-speech-') && !before.has(name)), []);
});

test('empty speech and pre-canceled assembly are rejected', async () => {
  await assert.rejects(assembleSpeechParts({ parts: (async function* () { /* no parts */ })() }), { code: 'invalid_audio' });
  await assert.rejects(assembleSpeechParts({ signal: AbortSignal.abort(new Error('canceled')),
    parts: (async function* () { yield speech(1, 300); })() }), /canceled/);
});
