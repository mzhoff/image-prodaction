import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import { prepareVideoImages } from './prepare-video-images';

const scope = { workspaceId: randomUUID(), documentId: randomUUID() };
const local = (id = 'asset-cropped-local'): AssetRecord => ({ id, name: 'crop.png', kind: 'image', mimeType: 'image/png',
  width: 648, height: 1152, createdAt: new Date().toISOString(), storage: { type: 'indexeddb', blobKey: `${id}:bytes` } });
const remote = (id = randomUUID()): AssetRecord => ({ ...local(id), storage: { type: 'remote', assetId: id } });
const request = (id: string): VideoGenerationRequest => ({ model: 'google/veo-3.1-lite', duration: 4, resolution: '720p', aspectRatio: '16:9', generateAudio: false,
  mode: 'frames', prompt: 'Move slowly', firstFrame: { assetId: id, description: '' }, references: [] });

test('local Crop bytes become a server reference once; first/last preserve identity and draft is immutable', async () => {
  const asset = local(), server = remote();
  const input = request(asset.id); input.lastFrame = { assetId: asset.id, description: 'end' };
  let reads = 0, uploads = 0;
  const result = await prepareVideoImages(input, [asset], scope, new AbortController().signal, {
    read: async (selected) => { reads++; assert.equal(selected, asset); return new Blob(['full cropped bytes'], { type: 'image/png' }); },
    upload: async (file, capturedScope) => { uploads++; assert.deepEqual(capturedScope, scope); assert.equal(await file.text(), 'full cropped bytes'); assert.equal(file.name, asset.name); return server; },
  });
  assert.equal(reads, 1); assert.equal(uploads, 1);
  assert.equal(result.request.firstFrame?.assetId, server.id);
  assert.deepEqual(result.request.lastFrame, { assetId: server.id, description: 'end' });
  assert.equal(input.firstFrame?.assetId, asset.id);
  assert.deepEqual(result.uploadedAssets, [server]);
});

test('mixed local and remote references preserve order/descriptions and remote inputs are never downloaded', async () => {
  const asset = local(), existing = remote(), server = remote();
  const input = request(asset.id); input.mode = 'references'; delete input.firstFrame;
  input.references = [{ slot: 1, assetId: existing.id, description: 'actor' }, { slot: 2, assetId: asset.id, description: 'style' }, { slot: 3, assetId: asset.id, description: 'light' }];
  const result = await prepareVideoImages(input, [asset, existing], scope, new AbortController().signal, {
    read: async (value) => { assert.equal(value.id, asset.id); return new Blob(['export result']); }, upload: async () => server,
  });
  assert.deepEqual(result.request.references.map((ref) => [ref.slot, ref.assetId, ref.description]), [[1, existing.id, 'actor'], [2, server.id, 'style'], [3, server.id, 'light']]);
  assert.deepEqual(result.uploadedAssets, [server]);
});

test('remote aliases use the storage server ID and need no upload', async () => {
  const asset = { ...remote(), id: 'local-graph-alias' };
  const io = { read: async () => { throw Error('Unexpected read'); }, upload: async () => { throw Error('Unexpected upload'); } };
  const result = await prepareVideoImages(request(asset.id), [asset], scope, new AbortController().signal, io);
  assert.equal(result.request.firstFrame?.assetId, asset.storage.type === 'remote' ? asset.storage.assetId : undefined);
  assert.deepEqual(result.uploadedAssets, []);
});

test('missing bytes, wrong asset kind and failed uploads never return a submit-ready request', async () => {
  const asset = local(); let uploads = 0;
  const io = { read: async () => null, upload: async () => { uploads++; return remote(); } };
  await assert.rejects(prepareVideoImages(request(asset.id), [asset], scope, new AbortController().signal, io), /прочитать/);
  await assert.rejects(prepareVideoImages(request(asset.id), [{ ...asset, kind: 'video' }], scope, new AbortController().signal, io), /недоступно/);
  assert.equal(uploads, 0);
  await assert.rejects(prepareVideoImages(request(asset.id), [asset], scope, new AbortController().signal, { read: async () => new Blob(['bytes']), upload: async () => { throw Error('upload failed'); } }), /upload failed/);
});

test('navigation/unmount abort during preparation prevents upload or a usable paid payload', async () => {
  const asset = local(), controller = new AbortController(); let uploads = 0;
  await assert.rejects(prepareVideoImages(request(asset.id), [asset], scope, controller.signal, {
    read: async () => { controller.abort(); return new Blob(['bytes']); }, upload: async () => { uploads++; return remote(); },
  }), { name: 'AbortError' });
  assert.equal(uploads, 0);
  const second = new AbortController();
  await assert.rejects(prepareVideoImages(request(asset.id), [asset], scope, second.signal, {
    read: async () => new Blob(['bytes']), upload: async () => { second.abort(); return remote(); },
  }), { name: 'AbortError' });
});
