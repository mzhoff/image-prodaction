import assert from 'node:assert/strict';
import test from 'node:test';
import { saveUploadedAudioAsset, uploadRemoteAudioAsset } from './remote-audio-asset';

const scope = { workspaceId: 'workspace', documentId: 'document' };
const dto = { id: 'audio', originalName: 'voice.wav', contentType: 'audio/wav', createdAt: '2026-09-06T00:00:00Z',
  audio: { container: 'wav', codec: 'pcm_s16le', contentType: 'audio/wav', durationSeconds: 1, sampleRateHz: 24000, channels: 1 } };
const file = new File([new Uint8Array([1])], 'voice.wav', { type: 'audio/wav' });

test('audio upload uses authenticated multipart scope and managed metadata', async () => {
  const asset = await uploadRemoteAudioAsset(file, scope, async (url, init) => {
    assert.equal(url, '/api/assets/audio'); assert.equal(init?.credentials, 'same-origin');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    assert.equal((init?.body as FormData).get('documentId'), 'document');
    assert.equal((init?.body as FormData).get('workspaceId'), 'workspace');
    assert.equal((init?.body as FormData).get('origin'), 'uploaded');
    return Response.json({ asset: dto });
  });
  assert.equal(asset.kind, 'audio'); assert.equal(asset.audio?.durationSeconds, 1);
  assert.deepEqual(asset.storage, { type: 'remote', assetId: 'audio' });
});

test('generated audio uses the saved origin rather than claiming provider provenance', async () => {
  await uploadRemoteAudioAsset(file, scope, async (_url, init) => {
    assert.equal((init?.body as FormData).get('origin'), 'saved');
    return Response.json({ asset: dto });
  }, 'saved');
});

test('invalid audio metadata, denied upload and missing document never create local fallback assets', async () => {
  await assert.rejects(() => uploadRemoteAudioAsset(file, scope, async () => Response.json({ asset: { ...dto, audio: null } })), /invalid audio/);
  await assert.rejects(() => uploadRemoteAudioAsset(file, scope, async () => Response.json({ error: { message: 'Denied' } }, { status: 403 })), /Denied/);
  await assert.rejects(() => saveUploadedAudioAsset(file), /saved project/);
});
