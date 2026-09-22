import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { exportTimelineOtio, importTimelineOtio } from './timeline-otio';

test('official OpenTimelineIO SDK reads our document and reserialization imports with exact ranges', { skip: !process.env.OTIO_PYTHON }, () => {
  const assetId = randomUUID(), audioId = randomUUID();
  const doc = exportTimelineOtio('SDK interop', { schemaVersion: 1, aspectRatio: '16:9', frameRate: 25,
    clips: [{ id: randomUUID(), assetId, kind: 'video', sourceInMs: 1500, durationMs: 2500, shotId: null }],
    audioClips: [{ id: randomUUID(), assetId: audioId, startMs: 500, sourceInMs: 1500, durationMs: 2000, gain: 0.5 }] });
  const result = spawnSync(process.env.OTIO_PYTHON!, ['-c', 'import sys, opentimelineio as otio\nt = otio.adapters.read_from_string(sys.stdin.read(), adapter_name="otio_json")\nassert t.duration().to_seconds() == 2.5\nassert len(t.tracks) == 2\nprint(otio.adapters.write_to_string(t, adapter_name="otio_json"))'], {
    input: JSON.stringify(doc), encoding: 'utf8', env: { ...process.env, PYTHONPATH: process.env.OTIO_PYTHONPATH }, timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  const imported = importTimelineOtio(JSON.parse(result.stdout), { [`asset://${assetId}`]: { assetId, kind: 'video' }, [`asset://${audioId}`]: { assetId: audioId, kind: 'audio' } }, randomUUID);
  assert.equal(imported.clips[0].sourceInMs, 1500); assert.equal(imported.clips[0].durationMs, 2500); assert.equal(imported.audioClips?.[0].startMs, 500);
});
