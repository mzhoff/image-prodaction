import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AssetRecord, AssetRepository } from './asset-repository';
import type { AssetDto, AssetUploadDependencies } from './asset-service-contracts';
import { persistAuthorizedVideoAsset, uploadVideoAsset, type UploadVideoAssetInput } from './video-asset-service';
import { createVideoDerivativeId, deriveWorkspaceVideoAsset } from './video-derivation-service';
import { excludeRetainedVideoDerivatives, isRetainedVideoDerivative } from './video-asset-retention';
import type { ValidatedVideo, VideoMetadata } from '@/shared/media/video-contracts';

const input: UploadVideoAssetInput = { userId: 'creator', workspaceId: 'workspace', documentId: null, originalName: 'video.mp4', bytes: new Uint8Array([1, 2, 3]), maxBytes: 100,
  origin: 'unknown', operation: 'video_video-only', requestedAssetId: '01a06168-51ef-7035-93a0-8d6a2ef41112' };
const video: VideoMetadata = { codec: 'h264', container: 'mp4', contentType: 'video/mp4', durationSeconds: 2, width: 640, height: 360, frameRate: 30, rotationDegrees: 0, browserPlayable: true,
  audioTracks: [{ index: 2, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: true }, { index: 5, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: false }] };
function inspected(bytes = input.bytes): ValidatedVideo {
  return { bytes, video, contentType: 'video/mp4', extension: 'mp4', byteSize: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') };
}
function setup() {
  const records = new Map<string, AssetRecord>(); let puts = 0; let rejectAccess = false;
  const variants: Parameters<AssetRepository['upsertVariant']>[0][] = [];
  const repository = {
    async createPendingOrFind(record: Parameters<AssetRepository['createPendingOrFind']>[0]) {
      const existing = records.get(record.id); if (existing) return { created: false, record: existing };
      const row = { ...record, status: 'pending' as const, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, errorCode: null };
      records.set(row.id, row); return { created: true, record: row };
    },
    async markReady(id: string) { const row = { ...records.get(id)!, status: 'ready' as const }; records.set(id, row); return row; },
    async markFailed(id: string) { records.set(id, { ...records.get(id)!, status: 'failed' }); },
    async resetPending(id: string) { return records.get(id)!; },
    async upsertVariant(value: Parameters<AssetRepository['upsertVariant']>[0]) { variants.push(value); return { ...value, createdAt: new Date() }; },
  } as unknown as AssetRepository;
  const dependencies: AssetUploadDependencies = { repository, bucket: 'private', createId: () => 'random-asset',
    async assertAccess() { if (rejectAccess) throw new Error('forbidden'); },
    objectStore: { async health() {}, async delete() {}, async put() { puts += 1; }, async get() { return { body: new Response(new Uint8Array(input.bytes)).body! }; } },
  };
  return { dependencies, records, variants, getPuts: () => puts, deny: () => { rejectAccess = true; } };
}
test('video persists verified metadata, keeps ready files immutable and rejects scope/payload changes', async () => {
  const fixture = setup();
  const first = await persistAuthorizedVideoAsset({ ...input, metadata: { video: { width: 99999 } } }, inspected(), fixture.dependencies);
  const second = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  assert.equal(first.id, second.id); assert.equal(fixture.getPuts(), 1); assert.equal(first.video.width, 640); assert.equal(first.width, 640);
  assert.equal(first.mediaKind, 'video'); assert.equal(first.audio, undefined); assert.equal(first.thumbnailUrl, undefined);
  await assert.rejects(persistAuthorizedVideoAsset({ ...input, workspaceId: 'outsider' }, inspected(), fixture.dependencies), /retry payload/);
  await assert.rejects(persistAuthorizedVideoAsset(input, inspected(new Uint8Array([9])), fixture.dependencies), /retry payload/);
  fixture.deny(); await assert.rejects(uploadVideoAsset(input, fixture.dependencies), /forbidden/);
});
test('derivation caches by original checksum and absolute selected stream, avoiding decoding a ready result', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  const cached = new Map<string, AssetDto>(); let decodes = 0; let reads = 0; let chosen: number | undefined;
  const dependencies: NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]> = {
    async getSource() { return source; }, async readSource() { reads += 1; return { asset: source, bytes: new Uint8Array(input.bytes), video }; },
    async findReady(id) { return cached.get(id); },
    async derive(value) { decodes += 1; chosen = value.options.audioTrackIndex; return { ...inspected(), video: { ...video, audioTracks: [] } }; },
    async persistVideo(value, inspected) { const result = await persistAuthorizedVideoAsset(value, inspected, fixture.dependencies); cached.set(result.id, result); return result; },
    async persistAudio() { throw new Error('unexpected audio persistence'); },
  };
  const request = { workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'video-only' as const };
  const first = await deriveWorkspaceVideoAsset(request, dependencies); const second = await deriveWorkspaceVideoAsset(request, dependencies);
  assert.equal(first.id, second.id); assert.equal(reads, 1); assert.equal(decodes, 1); assert.notEqual(first.id, source.id); assert.equal(chosen, undefined);
  assert.equal((await deriveWorkspaceVideoAsset({ ...request, kind: 'preview' }, dependencies)).id, source.id);
  assert.equal(reads, 1);
  await assert.rejects(deriveWorkspaceVideoAsset({ ...request, kind: 'audio', audioTrackIndex: 1 }, dependencies), { code: 'video_audio_track_not_found' });
  await deriveWorkspaceVideoAsset({ ...request, kind: 'preview', audioTrackIndex: 5 }, dependencies);
  assert.equal(chosen, 5);
  await assert.rejects(deriveWorkspaceVideoAsset({ ...request, workspaceId: 'outsider' }, dependencies), /Workspace/);
});
test('cache ids isolate Workspace, actor, original, original revision, operation and selected stream', () => {
  const options = { workspaceId: 'workspace', userId: 'creator', assetId: 'original', checksumSha256: 'checksum', kind: 'audio' as const, audioTrackIndex: 2 };
  const id = createVideoDerivativeId(options); assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, createVideoDerivativeId({ ...options }));
  for (const changed of [{ workspaceId: 'other' }, { userId: 'other' }, { assetId: 'other' }, { checksumSha256: 'changed' }, { kind: 'preview' as const }, { audioTrackIndex: 5 }]) assert.notEqual(id, createVideoDerivativeId({ ...options, ...changed }));
});
test('cached lineage cannot point at another source or operation', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  const dependencies = { getSource: async () => source, findReady: async () => ({ ...source, metadata: { sourceAssetId: 'wrong' } }) } as unknown as NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]>;
  await assert.rejects(deriveWorkspaceVideoAsset({ workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'video-only' }, dependencies), /Cached video derivation/);
});
test('no-audio originals fail extraction before reading bytes; canceled work releases the retry slot', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  let decodes = 0; let reads = 0;
  const silent = { ...source, video: { ...source.video, audioTracks: [] } };
  const dependencies: NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]> = {
    async getSource() { return silent; }, async findReady() { return undefined; },
    async readSource() { reads += 1; return { asset: silent, bytes: new Uint8Array(input.bytes), video: silent.video }; },
    async derive() { decodes += 1; if (decodes === 1) throw new Error('canceled by caller'); return { ...inspected(), video: silent.video }; },
    async persistVideo(value, checked) { return persistAuthorizedVideoAsset(value, checked, fixture.dependencies); },
    async persistAudio() { throw new Error('unexpected audio'); },
  };
  const request = { workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'audio' as const };
  await assert.rejects(deriveWorkspaceVideoAsset(request, dependencies), { code: 'video_has_no_audio' }); assert.equal(reads, 0);
  assert.equal((await deriveWorkspaceVideoAsset({ ...request, kind: 'preview' }, dependencies)).id, source.id); assert.equal(reads, 0);
  await assert.rejects(deriveWorkspaceVideoAsset({ ...request, kind: 'video-only' }, dependencies), /canceled by caller/);
  const output = await deriveWorkspaceVideoAsset({ ...request, kind: 'video-only' }, dependencies);
  assert.equal(output.mediaKind, 'video'); assert.equal(decodes, 2); assert.equal(reads, 2);
  assert.deepEqual(output.video?.audioTracks, []);
});
test('cached outputs reject changed selected track or missing typed media metadata', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  const cached = { ...source, operation: 'video_preview', metadata: { sourceAssetId: source.id, sourceChecksumSha256: source.checksumSha256, audioTrackIndex: 2 } };
  const dependencies = { getSource: async () => source, findReady: async () => cached } as unknown as NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]>;
  await assert.rejects(deriveWorkspaceVideoAsset({ workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'preview', audioTrackIndex: 5 }, dependencies), /Cached video derivation/);
  const invalidMetadata = { ...dependencies, findReady: async () => ({ ...cached, video: undefined }) } as NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]>;
  await assert.rejects(deriveWorkspaceVideoAsset({ workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'preview', audioTrackIndex: 2 }, invalidMetadata), /Cached video derivation/);
});
test('source-linked retention protects ready derivatives only while the exact same-Workspace original is ready', () => {
  const source = { id: 'original', workspaceId: 'workspace', checksumSha256: 'hash', status: 'ready' as const, mediaKind: 'video' as const };
  const derived = { workspaceId: 'workspace', operation: 'video_audio', status: 'ready' as const, metadata: { sourceAssetId: source.id, sourceChecksumSha256: source.checksumSha256 } };
  assert.equal(isRetainedVideoDerivative(derived, source), true);
  assert.equal(isRetainedVideoDerivative({ ...derived, operation: 'video_crop' }, source), true);
  for (const status of ['pending', 'failed', 'deleted'] as const) assert.equal(isRetainedVideoDerivative(derived, { ...source, status }), false);
  assert.equal(isRetainedVideoDerivative({ ...derived, status: 'pending' }, source), false);
  assert.equal(isRetainedVideoDerivative(derived, { ...source, workspaceId: 'other' }), false);
  assert.equal(isRetainedVideoDerivative(derived, { ...source, checksumSha256: 'changed' }), false);
  assert.equal(isRetainedVideoDerivative(derived), false);
  assert.equal(isRetainedVideoDerivative({ ...derived, operation: 'audio_convert' }, source), false);
  const sql = new PgDialect().sqlToQuery(excludeRetainedVideoDerivatives()).sql;
  assert.match(sql, /video_source\.workspace_id = "asset"\."workspace_id"/); assert.match(sql, /video_source\.status = 'ready'/);
  assert.match(sql, /video_source\.checksum_sha256 = "asset"\."metadata"->>'sourceChecksumSha256'/);
  assert.match(sql, /video_crop/);
});

test('new videos persist a derived poster before becoming ready and retries keep the original object immutable', async () => {
  const fixture = setup(); let posters = 0;
  const poster = { bytes: new Uint8Array([4, 5]), byteSize: 2, contentType: 'image/webp' as const, width: 80, height: 120, checksumSha256: 'poster-hash' };
  fixture.dependencies.createVideoThumbnail = async (bytes) => { posters += 1; assert.deepEqual(bytes, input.bytes); return poster; };
  const first = await persistAuthorizedVideoAsset({ ...input, operation: 'video_crop' }, inspected(), fixture.dependencies);
  const second = await persistAuthorizedVideoAsset({ ...input, operation: 'video_crop' }, inspected(), fixture.dependencies);
  assert.equal(first.id, second.id); assert.equal(posters, 1); assert.equal(fixture.getPuts(), 2);
  assert.equal(first.thumbnailUrl, `/api/assets/${first.id}/content?variant=thumbnail`); assert.equal(second.thumbnailUrl, first.thumbnailUrl);
  assert.equal(fixture.variants[0]?.assetId, first.id); assert.equal(fixture.variants[0]?.purpose, 'thumbnail');
  assert.match(fixture.variants[0]!.storageKey, /\.thumbnail\.webp$/);
  assert.equal(fixture.records.get(first.id)?.status, 'ready');
});

test('crop cache includes normalized bounds, default audio and source provenance; cached bounds cannot be changed', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  const cache = new Map<string, AssetDto>(); const decoded: unknown[] = [];
  const dependencies: NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]> = {
    async getSource() { return source; }, async readSource() { return { asset: source, bytes: new Uint8Array(input.bytes), video }; },
    async findReady(id) { return cache.get(id); },
    async derive(value) { decoded.push(value.options); return inspected(); },
    async persistVideo(value, checked) { const result = await persistAuthorizedVideoAsset(value, checked, fixture.dependencies); cache.set(result.id, result); return result; },
    async persistAudio() { throw new Error('unexpected audio persistence'); },
  };
  const crop = { x: 0, y: 0, width: 0.5, height: 1 };
  const request = { workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'crop' as const, crop };
  const first = await deriveWorkspaceVideoAsset(request, dependencies);
  const again = await deriveWorkspaceVideoAsset({ ...request, crop: { height: 1, width: 0.5, y: 0, x: 0 } }, dependencies);
  assert.equal(first.id, again.id); assert.notEqual(first.id, source.id); assert.equal(decoded.length, 1);
  assert.deepEqual(decoded[0], { kind: 'crop', crop, audioTrackIndex: 2 });
  assert.deepEqual(first.metadata?.crop, crop); assert.equal(first.metadata?.sourceChecksumSha256, source.checksumSha256);
  const moved = await deriveWorkspaceVideoAsset({ ...request, crop: { ...crop, x: 0.5 } }, dependencies);
  assert.notEqual(moved.id, first.id); assert.equal(decoded.length, 2);
  cache.set(first.id, { ...first, metadata: { ...first.metadata, crop: { ...crop, x: 0.5 } } });
  await assert.rejects(deriveWorkspaceVideoAsset(request, dependencies), /Cached video derivation/);
  const noCrop = { ...request, crop: undefined };
  await assert.rejects(deriveWorkspaceVideoAsset(noCrop, dependencies)); assert.equal(decoded.length, 2);
  assert.equal(fixture.records.get(source.id)?.status, 'ready');
});

test('trim cache is keyed by the selected interval and rejects source-duration or cached-range mismatches', async () => {
  const fixture = setup(); const source = await persistAuthorizedVideoAsset(input, inspected(), fixture.dependencies);
  const cache = new Map<string, AssetDto>(); let reads = 0;
  const dependencies: NonNullable<Parameters<typeof deriveWorkspaceVideoAsset>[1]> = {
    async getSource() { return source; }, async readSource() { reads += 1; return { asset: source, bytes: new Uint8Array(input.bytes), video }; },
    async findReady(id) { return cache.get(id); }, async derive(value) { assert.equal(value.options.kind, 'trim'); return inspected(); },
    async persistVideo(value, checked) { const result = await persistAuthorizedVideoAsset(value, checked, fixture.dependencies); cache.set(result.id, result); return result; },
    async persistAudio() { throw new Error('unexpected audio persistence'); },
  };
  const request = { workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, kind: 'trim' as const, range: { startMs: 200, endMs: 800 } };
  const first = await deriveWorkspaceVideoAsset(request, dependencies); const replay = await deriveWorkspaceVideoAsset(request, dependencies);
  assert.equal(first.id, replay.id); assert.equal(reads, 1); assert.notEqual(first.id, source.id); assert.deepEqual(first.metadata?.range, request.range);
  const other = await deriveWorkspaceVideoAsset({ ...request, range: { startMs: 1000, endMs: 2000 } }, dependencies);
  assert.notEqual(other.id, first.id); assert.equal(isRetainedVideoDerivative({ ...first, status: 'ready' }, { ...source, status: 'ready' }), true);
  await assert.rejects(deriveWorkspaceVideoAsset({ ...request, range: { startMs: 200, endMs: 3000 } }, dependencies), { code: 'invalid_video_trim' }); assert.equal(reads, 2);
  cache.set(first.id, { ...first, metadata: { ...first.metadata, range: { startMs: 0, endMs: 800 } } });
  await assert.rejects(deriveWorkspaceVideoAsset(request, dependencies), /Cached video derivation/);
});
