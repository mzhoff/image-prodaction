import assert from 'node:assert/strict';
import test from 'node:test';
import { createStoredVideoOperations, toVideoArtifact } from './pipeline-video-operations';
import { AssetStorageError } from '@/entities/asset/server/asset-service';
import type { VideoAssetDto } from '@/entities/asset/server/video-asset-service';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import type { PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';

const source = { id: 'video', workspaceId: 'workspace', mediaKind: 'video', status: 'ready',
  contentType: 'video/mp4', byteSize: 1000, checksumSha256: 'a'.repeat(64), width: 640, height: 360,
  video: { container: 'mp4', codec: 'h264', contentType: 'video/mp4', durationSeconds: 10, width: 640, height: 360,
    frameRate: 25, rotationDegrees: 0, browserPlayable: true, audioTracks: [{ index: 1, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: true }] },
} as VideoAssetDto;
const input: PipelineNodeHandlerInput = { nodeId: 'import', config: { assetId: source.id },
  context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' },
  inputs: {}, signal: new AbortController().signal,
};
test('stored video reference is scoped to run Workspace and preserves checksum/metadata', async () => {
  const operations = createStoredVideoOperations({ actorUserId: 'publisher' }, { async getSource(request) {
    assert.deepEqual(request, { assetId: 'video', workspaceId: 'workspace' }); return source;
  } });
  assert.deepEqual(await operations.resolveVideo(input), { kind: 'video', assetId: 'video', mimeType: 'video/mp4', sizeBytes: 1000,
    checksumSha256: 'a'.repeat(64), width: 640, height: 360, durationSeconds: 10, codec: 'h264', hasAudio: true,
    contentUrl: '/v1/runs/run/artifacts/video',
  });
  for (const changed of [{ ...source, workspaceId: 'other' }, { ...source, id: 'different' }, { ...source, status: 'failed' as const }]) {
    const invalid = createStoredVideoOperations({ actorUserId: 'publisher' }, { async getSource() { return changed; } });
    await assert.rejects(() => invalid.resolveVideo(input), /ready video in this workspace/);
  }
});
test('runtime derivation passes authorized workspace and selected stream, omitting audio selection for muted video', async () => {
  const requests: unknown[] = [];
  const operations = createStoredVideoOperations({ actorUserId: 'publisher' }, { async derive(request) {
    requests.push(request);
    return request.kind === 'audio' ? { ...source, id: 'audio', mediaKind: 'audio', contentType: 'audio/mp4', video: undefined,
      audio: { container: 'm4a', codec: 'aac', contentType: 'audio/mp4', durationSeconds: 10, sampleRateHz: 48000, channels: 2 } } : source;
  } });
  assert.equal((await operations.deriveVideo({ ...input, artifact: toVideoArtifact(source), kind: 'audio', audioTrackIndex: 1 })).kind, 'audio');
  assert.equal((await operations.deriveVideo({ ...input, artifact: toVideoArtifact(source), kind: 'video-only', audioTrackIndex: 1 })).kind, 'video');
  assert.deepEqual(requests, [
    { workspaceId: 'workspace', userId: 'publisher', assetId: 'video', kind: 'audio', audioTrackIndex: 1, signal: input.signal },
    { workspaceId: 'workspace', userId: 'publisher', assetId: 'video', kind: 'video-only', signal: input.signal },
  ]);
});
test('only busy/storage derivation errors are retryable and internal error details never leak', async () => {
  for (const [error, retryable] of [[new VideoProcessingError('video_busy', 'private detail'), true],
    [new VideoProcessingError('video_derivation_busy', 'private detail'), true], [new AssetStorageError(), true],
    [new VideoProcessingError('video_no_audio', 'private detail'), false], [new Error('secret storage path'), false]] as const) {
    const operations = createStoredVideoOperations({ actorUserId: 'publisher' }, { async derive() { throw error; } });
    await assert.rejects(() => operations.deriveVideo({ ...input, artifact: toVideoArtifact(source), kind: 'audio' }), (actual: unknown) => {
      assert.ok(actual instanceof PipelineNodeHandlerError);
      assert.equal(actual.retryable, retryable);
      assert.doesNotMatch(actual.message, /private detail|secret/);
      return true;
    });
  }
});

test('Crop uses authoritative dimensions, handles rotation and preserves actor, source and selected bounds', async () => {
  const requests: unknown[] = [];
  let stored = source;
  const operations = createStoredVideoOperations({ actorUserId: 'publisher' }, {
    async getSource(request) { assert.deepEqual(request, { assetId: 'video', workspaceId: 'workspace' }); return stored; },
    async derive(request) { requests.push(request); return { ...source, id: 'cropped' }; },
  });
  const artifact = { ...toVideoArtifact(source), width: 999, height: 999 };
  await operations.deriveVideo({ ...input, artifact, kind: 'crop', aspectRatio: '1:1' });
  assert.deepEqual(requests[0], { workspaceId: 'workspace', userId: 'publisher', assetId: 'video', kind: 'crop',
    crop: { x: 0.21875, y: 0, width: 0.5625, height: 1 }, signal: input.signal });
  stored = { ...source, video: { ...source.video, rotationDegrees: 90 } };
  await operations.deriveVideo({ ...input, artifact, kind: 'crop', aspectRatio: '1:1' });
  assert.deepEqual((requests[1] as { crop: unknown }).crop, { x: 0, y: 0.21875, width: 1, height: 0.5625 });
  const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
  await operations.deriveVideo({ ...input, artifact, kind: 'crop', crop, aspectRatio: 'Custom' });
  assert.deepEqual((requests[2] as { crop: unknown }).crop, crop);
  await operations.deriveVideo({ ...input, artifact, kind: 'crop', aspectRatio: 'Custom' });
  assert.deepEqual((requests[3] as { crop: unknown }).crop, { x: 0, y: 0, width: 1, height: 1 });
  stored = source;
  await operations.deriveVideo({ ...input, artifact, kind: 'crop', crop, aspectRatio: '1:1' });
  const fitted = (requests[4] as { crop: typeof crop }).crop;
  assert.equal(fitted.x, crop.x); assert.equal(fitted.y, crop.y);
  assert.equal(fitted.width, crop.width);
  assert.ok(Math.abs(fitted.width * source.width! - fitted.height * source.height!) < 1e-9);
  const before = requests.length;
  stored = { ...source, workspaceId: 'other' };
  await assert.rejects(() => operations.deriveVideo({ ...input, artifact, kind: 'crop', crop }), /could not be prepared/);
  stored = { ...source, checksumSha256: 'b'.repeat(64) };
  await assert.rejects(() => operations.deriveVideo({ ...input, artifact, kind: 'crop', crop }), /could not be prepared/);
  assert.equal(requests.length, before);
});
