import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { AssetRecord, AssetRepository } from './asset-repository';
import type { AssetUploadDependencies } from './asset-service-contracts';
import { persistAuthorizedAudioAsset, uploadAudioAsset, type UploadAudioAssetInput } from './audio-asset-service';
import type { ValidatedAudio } from '@/shared/media/audio-contracts';
import { getAssetContent } from './asset-content-service';

const input: UploadAudioAssetInput = { userId: 'creator', workspaceId: 'workspace', documentId: null, originalName: 'voice.wav', bytes: new Uint8Array([1, 2, 3]), maxBytes: 100,
  origin: 'unknown', operation: 'audio_convert', requestedAssetId: '01a06168-51ef-7035-93a0-8d6a2ef41112' };
function inspected(bytes = input.bytes): ValidatedAudio {
  return { bytes, audio: { channels: 1, codec: 'pcm_s16le', container: 'wav', contentType: 'audio/wav', durationSeconds: 2, sampleRateHz: 16000 },
    contentType: 'audio/wav', extension: 'wav', byteSize: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') };
}
function setup() {
  const records = new Map<string, AssetRecord>(); let sequence = 0; let puts = 0; let rejectAccess = false;
  const repo = {
    async createPendingOrFind(record: Parameters<AssetRepository['createPendingOrFind']>[0]) {
      const prior = records.get(record.id); if (prior) return { created: false, record: prior };
      const row = { ...record, status: 'pending' as const, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, errorCode: null };
      records.set(row.id, row); return { created: true, record: row };
    },
    async findGeneratedByJobId(id: string) { return [...records.values()].find((row) => row.generationJobId === id); },
    async markReady(id: string) { const row = { ...records.get(id)!, status: 'ready' as const }; records.set(id, row); return row; },
    async markFailed(id: string) { records.set(id, { ...records.get(id)!, status: 'failed' }); },
    async resetPending(id: string) { return records.get(id)!; },
    async findAccessible(id: string) { return records.get(id); },
    async findVariant() { return undefined; },
  } as unknown as AssetRepository;
  const dependencies: AssetUploadDependencies = { repository: repo, bucket: 'private', createId: () => `asset-${++sequence}`,
    async assertAccess() { if (rejectAccess) throw new Error('forbidden'); },
    objectStore: { async health() {}, async delete() {}, async put() { puts += 1; }, async get(location) {
      const bytes = location.range ? new Uint8Array([2, 3]) : input.bytes;
      return { body: new Response(new Uint8Array(bytes)).body!, contentLength: bytes.length };
    } },
  };
  return { dependencies, records, getPuts: () => puts, deny: () => { rejectAccess = true; } };
}
test('audio persistence preserves original metadata, retries stable id and rejects changed payload/tenant', async () => {
  const fixture = setup();
  const first = await persistAuthorizedAudioAsset({ ...input, metadata: { audio: { durationSeconds: 99 } } }, inspected(), fixture.dependencies);
  const replay = await persistAuthorizedAudioAsset(input, inspected(), fixture.dependencies);
  assert.equal(first.id, replay.id); assert.equal(fixture.getPuts(), 1); assert.equal(first.audio.durationSeconds, 2);
  assert.equal(first.mediaKind, 'audio'); assert.equal(first.thumbnailUrl, undefined); assert.equal(first.height, null);
  await assert.rejects(persistAuthorizedAudioAsset({ ...input, workspaceId: 'outsider' }, inspected(), fixture.dependencies), /retry payload/);
  await assert.rejects(persistAuthorizedAudioAsset(input, inspected(new Uint8Array([4, 5])), fixture.dependencies), /retry payload/);
});
test('generated TTS job returns its existing ready audio without another storage write', async () => {
  const fixture = setup(); const generated = { ...input, requestedAssetId: undefined, origin: 'generated' as const, generationJobId: 'job', provider: 'fake', modelId: 'fake-tts', operation: 'tts' };
  const first = await persistAuthorizedAudioAsset(generated, inspected(), fixture.dependencies);
  const second = await persistAuthorizedAudioAsset(generated, inspected(), fixture.dependencies);
  assert.equal(first.id, second.id); assert.equal(fixture.getPuts(), 1);
});
test('session authorization precedes expensive probing; ready audio content supports bounded ranges', async () => {
  const fixture = setup(); fixture.deny();
  await assert.rejects(uploadAudioAsset(input, fixture.dependencies), /forbidden/);
  const asset = await persistAuthorizedAudioAsset(input, inspected(), fixture.dependencies);
  const read = await getAssetContent('creator', asset.id, fixture.dependencies, undefined, 'bytes=1-2');
  assert.deepEqual(read.range, { start: 1, end: 2, total: 3 }); assert.equal(read.object.contentLength, 2);
  await assert.rejects(getAssetContent('creator', asset.id, fixture.dependencies, 'thumbnail'), { name: 'AssetNotFoundError' });
});
