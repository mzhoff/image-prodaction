import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetObjectStore } from '@/shared/storage/s3-assets';
import {
  AssetNotFoundError,
  AssetStorageError,
  cleanupOrphanedAssets,
  deleteAsset,
  getAssetContent,
  uploadImageAsset,
  type AssetUploadDependencies,
} from './asset-service';
import type { AssetRecord, AssetRepository, PendingAssetInput } from './asset-repository';

const assetId = '01900000-0000-7000-8000-000000000003';
const workspaceId = '01900000-0000-7000-8000-000000000001';
const documentId = '01900000-0000-7000-8000-000000000002';
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('uploads an image through pending to ready with server-owned storage coordinates', async () => {
  const repository = new MemoryAssetRepository();
  const stored: Array<{ bucket: string; key: string }> = [];
  const dependencies: AssetUploadDependencies = {
    repository,
    bucket: 'private-assets',
    createId: () => assetId,
    assertAccess: async (scope) => {
      assert.deepEqual(scope, { documentId, userId: 'user-1', workspaceId });
    },
    objectStore: createObjectStore({
      put: async (input) => {
        stored.push({ bucket: input.bucket, key: input.key });
      },
    }),
  };

  const result = await uploadImageAsset({
    bytes: onePixelPng,
    claimedContentType: 'image/png',
    documentId,
    maxBytes: 1024,
    originalName: '../avatar.png',
    userId: 'user-1',
    workspaceId,
  }, dependencies);

  assert.equal(result.status, 'ready');
  assert.equal(result.originalName, 'avatar.png');
  assert.equal(result.contentUrl, `/api/assets/${assetId}/content`);
  assert.deepEqual(stored, [{
    bucket: 'private-assets',
    key: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.png`,
  }]);
  assert.deepEqual(repository.transitions, ['pending', 'ready']);
});

test('marks the database row failed and exposes only a generic storage error', async () => {
  const repository = new MemoryAssetRepository();
  const dependencies: AssetUploadDependencies = {
    repository,
    bucket: 'private-assets',
    createId: () => assetId,
    assertAccess: async () => undefined,
    objectStore: createObjectStore({
      put: async () => {
        throw new Error('provider-secret-detail');
      },
    }),
  };

  await assert.rejects(
    uploadImageAsset({
      bytes: onePixelPng,
      claimedContentType: 'image/png',
      maxBytes: 1024,
      originalName: 'avatar.png',
      userId: 'user-1',
      workspaceId,
    }, dependencies),
    (error: unknown) => error instanceof AssetStorageError
      && error.message === 'Asset storage is temporarily unavailable.'
      && !error.message.includes('provider-secret-detail'),
  );
  assert.deepEqual(repository.transitions, ['pending', 'failed']);
});

test('does not read an object when membership-scoped repository access fails', async () => {
  const repository = new MemoryAssetRepository();
  let getCalls = 0;
  await assert.rejects(
    getAssetContent('other-user', assetId, {
      repository,
      objectStore: createObjectStore({
        get: async () => {
          getCalls += 1;
          return { body: new ReadableStream() };
        },
      }),
    }),
    AssetNotFoundError,
  );
  assert.equal(getCalls, 0);
});

test('delete is idempotent and orphan cleanup can be scheduled separately', async () => {
  const repository = new MemoryAssetRepository();
  repository.record = createRecord({ status: 'ready' });
  let deleteCalls = 0;
  const dependencies = {
    repository,
    objectStore: createObjectStore({
      delete: async () => {
        deleteCalls += 1;
      },
    }),
  };

  await deleteAsset('user-1', assetId, dependencies);
  await deleteAsset('user-1', assetId, dependencies);
  assert.equal(deleteCalls, 1);

  repository.record = createRecord({ id: '01900000-0000-7000-8000-000000000004', status: 'failed' });
  repository.cleanupCandidates = [repository.record];
  const cleanup = await cleanupOrphanedAssets({ before: new Date(), limit: 10 }, dependencies);
  assert.deepEqual(cleanup, { scanned: 1, deleted: 1, failed: 0 });
  assert.equal(deleteCalls, 2);
});

class MemoryAssetRepository implements AssetRepository {
  cleanupCandidates: AssetRecord[] = [];
  record: AssetRecord | undefined;
  transitions: string[] = [];

  async createPending(input: PendingAssetInput) {
    this.transitions.push('pending');
    this.record = createRecord({ ...input, status: 'pending' });
    return this.record;
  }

  async findAccessible(assetIdToFind: string) {
    return this.record?.id === assetIdToFind ? this.record : undefined;
  }

  async findCleanupCandidates() {
    return this.cleanupCandidates;
  }

  async markDeleted(assetIdToDelete: string, deletedAt: Date) {
    if (this.record?.id === assetIdToDelete) {
      this.record = { ...this.record, status: 'deleted', deletedAt, updatedAt: deletedAt };
    }
  }

  async markFailed(assetIdToFail: string, errorCode: string) {
    this.transitions.push('failed');
    if (this.record?.id === assetIdToFail) {
      this.record = { ...this.record, status: 'failed', errorCode, updatedAt: new Date() };
    }
  }

  async markReady(assetIdToReady: string) {
    this.transitions.push('ready');
    if (!this.record || this.record.id !== assetIdToReady) throw new Error('missing test asset');
    this.record = { ...this.record, status: 'ready', updatedAt: new Date() };
    return this.record;
  }
}

function createRecord(overrides: Partial<AssetRecord> = {}): AssetRecord {
  const now = new Date('2026-07-16T00:00:00.000Z');
  return {
    id: assetId,
    workspaceId,
    documentId,
    createdByUserId: 'user-1',
    bucket: 'private-assets',
    storageKey: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.png`,
    originalName: 'avatar.png',
    contentType: 'image/png',
    byteSize: onePixelPng.length,
    width: 1,
    height: 1,
    checksumSha256: 'a'.repeat(64),
    status: 'pending',
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function createObjectStore(overrides: Partial<AssetObjectStore> = {}): AssetObjectStore {
  return {
    delete: async () => undefined,
    get: async () => ({ body: new ReadableStream() }),
    put: async () => undefined,
    ...overrides,
  };
}
