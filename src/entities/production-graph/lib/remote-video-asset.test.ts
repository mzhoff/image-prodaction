import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_VIDEO_BYTES } from '@/shared/media/video-contracts';
import { activateAssetScope, AssetClientError } from './remote-asset';
import { deriveRemoteVideoAsset, mapRemoteVideoAsset, remoteVideoAssetSchema, uploadRemoteVideoAsset } from './remote-video-asset';

const scope = { workspaceId: '019b48b0-40e7-7a1b-8000-000000000001', documentId: '019b48b0-40e7-7a1b-8000-000000000002' };
const assetId = '019b48b0-40e7-7a1b-8000-000000000010';
function videoDto() {
  return { id: assetId, originalName: 'phone.mov', contentType: 'video/quicktime', createdAt: '2026-09-06T00:00:00.000Z',
    video: { container: 'mov' as const, codec: 'hevc' as const, contentType: 'video/quicktime' as const, durationSeconds: 12, pictureDurationSeconds: 12,
      width: 2160, height: 3840, frameRate: 30, rotationDegrees: 0, browserPlayable: false,
      audioTracks: [{ index: 2, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: true, language: 'rus' },
        { index: 5, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: false, language: 'eng' }] } };
}
function audioDto() {
  return { id: '019b48b0-40e7-7a1b-8000-000000000011', originalName: 'audio.m4a', contentType: 'audio/mp4', createdAt: '2026-09-06T00:00:00.000Z',
    audio: { container: 'm4a', codec: 'aac', contentType: 'audio/mp4', durationSeconds: 12, channels: 2, sampleRateHz: 48000 } };
}
test('remote video DTO maps dimensions, stream metadata and immutable server id without local storage', () => {
  const dto = videoDto(); const asset = mapRemoteVideoAsset(remoteVideoAssetSchema.parse(dto));
  assert.equal(asset.kind, 'video'); assert.equal(asset.name, dto.originalName); assert.equal(asset.mimeType, dto.contentType);
  assert.equal(asset.width, 2160); assert.equal(asset.height, 3840); assert.deepEqual(asset.video, dto.video);
  assert.deepEqual(asset.storage, { type: 'remote', assetId });
  assert.equal('blob' in asset, false); assert.equal('dataUrl' in asset, false);
  assert.equal(remoteVideoAssetSchema.safeParse({ ...dto, video: { ...dto.video, width: 100000 } }).success, false);
  assert.equal(remoteVideoAssetSchema.safeParse({ ...dto, video: undefined }).success, false);
  assert.equal(remoteVideoAssetSchema.safeParse({ ...dto, contentType: 'image/png' }).success, false);
});
test('video upload sends explicit Workspace/document multipart scope with same-origin credentials', async () => {
  const clearScope = activateAssetScope({ workspaceId: 'different-workspace', documentId: 'different-document' });
  let body: FormData | undefined;
  try {
    const asset = await uploadRemoteVideoAsset(new File(['tiny-fixture'], 'phone.mov', { type: 'video/quicktime' }), scope, async (input, init) => {
      assert.equal(input, '/api/assets/video'); assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.headers, undefined, 'Browser must supply the multipart boundary.');
      body = init?.body as FormData; return Response.json({ asset: videoDto() }, { status: 201 });
    });
    assert.equal(body?.get('workspaceId'), scope.workspaceId); assert.equal(body?.get('documentId'), scope.documentId);
    assert.equal((body?.get('file') as File).name, 'phone.mov');
    assert.deepEqual([...body!.keys()].sort(), ['documentId', 'file', 'workspaceId']);
    assert.equal(asset.id, assetId);
  } finally { clearScope(); }
});
test('client video cap rejects oversized files before fetch and accepts the exact boundary', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls += 1; return Response.json({ asset: videoDto() }); };
  // File size is overridden to exercise the boundary without allocating 100 MiB fixtures.
  const oversized = new File(['x'], 'large.mp4', { type: 'video/mp4' }); Object.defineProperty(oversized, 'size', { value: MAX_VIDEO_BYTES + 1 });
  await assert.rejects(uploadRemoteVideoAsset(oversized, scope, request), /100 MiB/); assert.equal(calls, 0);
  const boundary = new File(['x'], 'allowed.mp4', { type: 'video/mp4' }); Object.defineProperty(boundary, 'size', { value: MAX_VIDEO_BYTES });
  await uploadRemoteVideoAsset(boundary, scope, request); assert.equal(calls, 1);
});
test('audio extraction request preserves absolute track index, while default selection omits it', async () => {
  const bodies: unknown[] = [];
  const request: typeof fetch = async (input, init) => {
    assert.equal(input, '/api/assets/video/derive'); assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'same-origin');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' }); bodies.push(JSON.parse(init?.body as string));
    return Response.json({ asset: audioDto() });
  };
  const common = { workspaceId: scope.workspaceId, assetId, kind: 'audio' as const };
  const audio = await deriveRemoteVideoAsset({ ...common, audioTrackIndex: 5 }, request);
  assert.equal(audio.kind, 'audio'); assert.equal(audio.audio?.codec, 'aac'); assert.equal(audio.storage.type, 'remote');
  await deriveRemoteVideoAsset({ ...common, audioTrackIndex: undefined }, request);
  assert.deepEqual(bodies, [{ ...common, audioTrackIndex: 5 }, common]);
});
test('video-only has no audio-track selection and maps a silent output; preview remains a separate video', async () => {
  const bodies: unknown[] = [];
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(init?.body as string) as { kind: string }; bodies.push(body);
    const dto = videoDto();
    return Response.json({ asset: { ...dto, id: `${assetId}-derived`, video: { ...dto.video, audioTracks: body.kind === 'video-only' ? [] : dto.video.audioTracks } } });
  };
  const silent = await deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId, kind: 'video-only' }, request);
  const preview = await deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId, kind: 'preview' }, request);
  assert.equal(silent.kind, 'video'); assert.deepEqual(silent.video?.audioTracks, []); assert.equal(preview.kind, 'video');
  assert.notEqual(preview.id, assetId); assert.equal(preview.video?.audioTracks.length, 2);
  assert.deepEqual(bodies, [{ workspaceId: scope.workspaceId, assetId, kind: 'video-only' }, { workspaceId: scope.workspaceId, assetId, kind: 'preview' }]);
});
test('remote video requests preserve API errors and reject malformed success payloads', async () => {
  const file = new File(['x'], 'video.mp4', { type: 'video/mp4' });
  for (const status of [401, 403, 413, 429, 503]) {
    await assert.rejects(uploadRemoteVideoAsset(file, scope, async () => Response.json({ error: { code: 'rejected', message: 'Safe error' } }, { status })), (error: unknown) => error instanceof AssetClientError && error.status === status);
  }
  await assert.rejects(deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId, kind: 'audio' }, async () => new Response('not json', { status: 502 })), (error: unknown) => error instanceof AssetClientError && error.status === 502);
  await assert.rejects(uploadRemoteVideoAsset(file, scope, async () => Response.json({ asset: audioDto() })));
  await assert.rejects(deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId, kind: 'audio' }, async () => Response.json({ asset: videoDto() })));
});

test('video crop sends normalized frame and cancellation signal and maps the encoded dimensions', async () => {
  const controller = new AbortController();
  const crop = { x: 0.125, y: 0, width: 0.75, height: 1 };
  const result = await deriveRemoteVideoAsset({ workspaceId: scope.workspaceId, assetId, kind: 'crop', crop }, async (_input, init) => {
    assert.equal(init?.signal, controller.signal);
    assert.deepEqual(JSON.parse(init?.body as string), { workspaceId: scope.workspaceId, assetId, kind: 'crop', crop });
    const source = videoDto();
    return Response.json({ asset: { ...source, originalName: 'crop.mp4', contentType: 'video/mp4',
      video: { ...source.video, container: 'mp4', codec: 'h264', contentType: 'video/mp4', width: 1620, height: 3840, browserPlayable: true } } });
  }, controller.signal);
  assert.equal(result.kind, 'video');
  assert.equal(result.mimeType, 'video/mp4');
  assert.deepEqual([result.width, result.height], [1620, 3840]);
  assert.equal(result.video?.durationSeconds, 12);
});
