import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMusicPcm } from './music-rhythm';

test('onsets recover a synthetic 120 BPM pulse and its offset; silence is not a confident rhythm', () => {
  const pcm = Buffer.alloc(16000 * 10);
  for (let beat = 0; beat < 20; beat++) for (let sample = 0; sample < 80; sample++) pcm.writeInt16LE(Math.round(Math.sin(sample * 0.7) * 16000), (beat * 4000 + 800 + sample) * 2);
  const result = analyzeMusicPcm(pcm, { durationMs: 10000 });
  assert.equal(result.bpm, 120); assert.ok(result.confidence > 0.8); assert.equal(result.beatsMs[0], 100);
  assert.ok(result.beatsMs.every((time, index) => index === 0 || time - result.beatsMs[index - 1] === 500));
  const silence = analyzeMusicPcm(Buffer.alloc(16000 * 5), { durationMs: 5000 });
  assert.equal(silence.bpm, null); assert.equal(silence.confidence, 0); assert.deepEqual(silence.beatsMs, []);
});
test('manual BPM preserves supplied offset and fractional tempo without assuming downbeats', () => {
  const result = analyzeMusicPcm(Buffer.alloc(16000 * 5), { durationMs: 5000, bpm: 97, beatOffsetMs: 125 });
  assert.equal(result.method, 'manual'); assert.equal(result.beatsMs[0], 125);
  assert.equal(result.beatsMs[1], Math.round(125 + 60000 / 97)); assert.ok(result.beatsMs.at(-1)! < 5000);
});
