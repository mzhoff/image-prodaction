import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetObjectStore } from '@/shared/storage/s3-assets';
import {
  AssetLibraryQueryError,
  AssetNotFoundError,
  AssetProvenanceError,
  AssetStorageError,
  cleanupDocumentAssets,
  cleanupOrphanedAssets,
  deleteAsset,
  getAssetContent,
  getLibraryAssetMetadata,
  listLibraryAssets,
  uploadImageAsset,
  type AssetUploadDependencies,
} from './asset-service';
import type {
  AssetLibraryFacets,
  AssetLibraryFilters,
  AssetRecord,
  AssetRepository,
  AssetVariantInput,
  AssetVariantRecord,
  LibraryAssetRecord,
  PendingAssetInput,
} from './asset-repository';

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

test('upload stores a thumbnail variant and returns its authenticated URL', async () => {
  const thumbnailId = '01900000-0000-7000-8000-000000000009';
  const thumbnailBytes = Buffer.from('thumbnail-webp');
  const repository = new MemoryAssetRepository();
  const stored: Array<{ body: Uint8Array; contentType: string; key: string }> = [];
  const ids = [assetId, thumbnailId];

  const result = await uploadImageAsset({
    bytes: onePixelPng,
    claimedContentType: 'image/png',
    documentId,
    maxBytes: 1024,
    originalName: 'avatar.png',
    userId: 'user-1',
    workspaceId,
  }, {
    repository,
    bucket: 'private-assets',
    createId: () => {
      const id = ids.shift();
      if (!id) throw new Error('unexpected id allocation');
      return id;
    },
    createThumbnail: async (bytes) => {
      assert.deepEqual(Buffer.from(bytes), onePixelPng);
      return createThumbnailImage(thumbnailBytes);
    },
    assertAccess: async () => undefined,
    objectStore: createObjectStore({
      put: async (input) => {
        stored.push({
          body: input.body,
          contentType: input.contentType,
          key: input.key,
        });
      },
    }),
  });

  assert.equal(result.thumbnailUrl, `/api/assets/${assetId}/content?variant=thumbnail`);
  assert.deepEqual(stored.map(({ contentType, key }) => ({ contentType, key })), [
    {
      contentType: 'image/png',
      key: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.png`,
    },
    {
      contentType: 'image/webp',
      key: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.thumbnail.webp`,
    },
  ]);
  assert.deepEqual(stored[1]?.body, thumbnailBytes);
  assert.deepEqual(repository.variants, [
    createVariantRecord({
      id: thumbnailId,
      storageKey: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.thumbnail.webp`,
      byteSize: thumbnailBytes.byteLength,
      checksumSha256: 'b'.repeat(64),
    }, repository.variants[0]?.createdAt),
  ]);
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

test('durable origins are explicit while technical operation outputs stay hidden by default', async () => {
  const uploaded = await uploadWithProvenance({
    libraryVisible: true,
    origin: 'uploaded',
  });
  assert.deepEqual(pickProvenance(uploaded.repository.record), {
    generationJobId: null,
    libraryVisible: true,
    modelId: null,
    operation: 'upload',
    origin: 'uploaded',
    provider: null,
  });

  const generated = await uploadWithProvenance({
    generationJobId: '01900000-0000-7000-8000-000000000099',
    libraryVisible: true,
    modelId: 'google/gemini-image',
    operation: 'generate-image',
    origin: 'generated',
    provider: 'openrouter',
  });
  assert.deepEqual(pickProvenance(generated.repository.record), {
    generationJobId: '01900000-0000-7000-8000-000000000099',
    libraryVisible: true,
    modelId: 'google/gemini-image',
    operation: 'generate-image',
    origin: 'generated',
    provider: 'openrouter',
  });

  const explicitSave = await uploadWithProvenance({
    libraryVisible: true,
    origin: 'saved',
  });
  assert.deepEqual(pickProvenance(explicitSave.repository.record), {
    generationJobId: null,
    libraryVisible: true,
    modelId: null,
    operation: 'save_to_library',
    origin: 'saved',
    provider: null,
  });

  const technicalOutput = await uploadWithProvenance({});
  assert.deepEqual(pickProvenance(technicalOutput.repository.record), {
    generationJobId: null,
    libraryVisible: false,
    modelId: null,
    operation: null,
    origin: 'unknown',
    provider: null,
  });
});

test('visible generated assets require complete model and generation ledger lineage', async () => {
  await assert.rejects(
    uploadWithProvenance({
      libraryVisible: true,
      origin: 'generated',
      provider: 'openrouter',
    }),
    AssetProvenanceError,
  );
});

test('Library list authorizes the workspace and forwards every normalized filter', async () => {
  const repository = new MemoryAssetRepository();
  repository.libraryRecords = [
    createLibraryRecord({
      id: '01900000-0000-7000-8000-000000000031',
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      origin: 'uploaded',
      originalName: 'Brand hero.png',
    }),
    createLibraryRecord({
      id: '01900000-0000-7000-8000-000000000030',
      createdAt: new Date('2026-07-17T09:00:00.000Z'),
      origin: 'generated',
      originalName: 'Brand scene.png',
    }),
    createLibraryRecord({
      id: '01900000-0000-7000-8000-000000000029',
      createdAt: new Date('2026-07-17T08:00:00.000Z'),
      origin: 'saved',
      originalName: 'Brand export.png',
    }),
  ];
  repository.libraryFacets = createLibraryFacets();
  const membershipChecks: Array<{ userId: string; workspaceId: string }> = [];

  const page = await listLibraryAssets('user-1', {
    workspaceId,
    origins: ['uploaded', 'generated', 'saved', 'unknown'],
    mediaKinds: ['image', 'video'],
    providers: [' openrouter ', 'openrouter'],
    modelIds: [' model-a ', 'model-b'],
    documentIds: [documentId, documentId],
    search: '  Brand   scene  ',
    limit: 2,
  }, {
    assertMembership: async (userId, checkedWorkspaceId) => {
      membershipChecks.push({ userId, workspaceId: checkedWorkspaceId });
    },
    repository,
  });

  assert.deepEqual(membershipChecks, [{ userId: 'user-1', workspaceId }]);
  assert.deepEqual(repository.lastLibraryInput, {
    userId: 'user-1',
    workspaceId,
    cursor: undefined,
    documentIds: [documentId],
    limit: 3,
    mediaKinds: ['image', 'video'],
    modelIds: ['model-a', 'model-b'],
    origins: ['uploaded', 'generated', 'saved', 'unknown'],
    providers: ['openrouter'],
    search: 'Brand scene',
  });
  assert.deepEqual(page.items.map((item) => item.id), [
    '01900000-0000-7000-8000-000000000031',
    '01900000-0000-7000-8000-000000000030',
  ]);
  assert.equal(page.items[0]?.document?.id, documentId);
  assert.equal(
    page.items[0]?.thumbnailUrl,
    `/api/assets/${page.items[0]?.id}/content?variant=thumbnail`,
  );
  assert.deepEqual(page.facets, repository.libraryFacets);
  assert.ok(page.nextCursor);

  repository.libraryRecords = [];
  await listLibraryAssets('user-1', {
    workspaceId,
    cursor: page.nextCursor,
    limit: 2,
  }, {
    assertMembership: async () => undefined,
    repository,
  });
  assert.deepEqual(repository.lastLibraryInput?.cursor, {
    createdAt: new Date('2026-07-17T09:00:00.000Z'),
    id: '01900000-0000-7000-8000-000000000030',
  });
});

test('Library rejects an outsider and malformed pagination before querying assets', async () => {
  const repository = new MemoryAssetRepository();
  await assert.rejects(
    listLibraryAssets('outsider', { workspaceId }, {
      assertMembership: async () => {
        throw new Error('workspace access denied');
      },
      repository,
    }),
    /workspace access denied/,
  );
  assert.equal(repository.libraryListCalls, 0);

  await assert.rejects(
    listLibraryAssets('user-1', { workspaceId, cursor: 'not-a-cursor' }, {
      assertMembership: async () => undefined,
      repository,
    }),
    AssetLibraryQueryError,
  );
  assert.equal(repository.libraryListCalls, 0);
});

test('Library pagination exposes every filtered item beyond the default 40 item page', async () => {
  const repository = new MemoryAssetRepository();
  repository.libraryRecords = Array.from({ length: 45 }, (_, index) => createLibraryRecord({
    id: `01900000-0000-7000-8000-${String(100_000_000_044 - index).padStart(12, '0')}`,
    createdAt: new Date(Date.UTC(2026, 6, 17, 12, 0, 0) - index * 60_000),
    originalName: `Library asset ${index + 1}.png`,
  }));
  const dependencies = {
    assertMembership: async () => undefined,
    repository,
  };

  const firstPage = await listLibraryAssets('user-1', { workspaceId }, dependencies);
  assert.equal(firstPage.items.length, 40);
  assert.ok(firstPage.nextCursor);

  const secondPage = await listLibraryAssets('user-1', {
    workspaceId,
    cursor: firstPage.nextCursor,
  }, dependencies);
  assert.equal(secondPage.items.length, 5);
  assert.equal(secondPage.nextCursor, null);
  assert.deepEqual(
    new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size,
    45,
  );
});

test('Library metadata never exposes a ready asset that is still hidden', async () => {
  const repository = new MemoryAssetRepository();
  repository.record = createRecord({
    libraryVisible: false,
    origin: 'generated',
    status: 'ready',
  });

  await assert.rejects(
    getLibraryAssetMetadata('user-1', assetId, repository),
    AssetNotFoundError,
  );

  repository.record = createRecord({
    libraryVisible: true,
    origin: 'generated',
    status: 'ready',
  });
  const visible = await getLibraryAssetMetadata('user-1', assetId, repository);
  assert.equal(visible.id, assetId);
  assert.equal(visible.libraryVisible, true);
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

test('thumbnail content reads the stored variant instead of the original object', async () => {
  const repository = new MemoryAssetRepository();
  repository.record = createRecord({ status: 'ready' });
  const thumbnail = createVariantRecord();
  repository.variants = [thumbnail];
  const requestedKeys: string[] = [];
  const thumbnailBytes = Buffer.from('stored-thumbnail');

  const content = await getAssetContent('user-1', assetId, {
    repository,
    objectStore: createObjectStore({
      get: async ({ key }) => {
        requestedKeys.push(key);
        return {
          body: new Response(thumbnailBytes).body!,
          contentLength: thumbnailBytes.byteLength,
          contentType: 'image/webp',
        };
      },
    }),
  }, 'thumbnail');

  assert.deepEqual(requestedKeys, [thumbnail.storageKey]);
  assert.equal(content.contentType, 'image/webp');
  assert.equal(content.byteSize, thumbnail.byteSize);
  assert.equal(content.asset.thumbnailUrl, `/api/assets/${assetId}/content?variant=thumbnail`);
  assert.deepEqual(
    Buffer.from(await new Response(content.object.body).arrayBuffer()),
    thumbnailBytes,
  );
});

test('legacy Library thumbnail is generated lazily once and then served from its variant', async () => {
  const thumbnailId = '01900000-0000-7000-8000-000000000009';
  const thumbnailBytes = Buffer.from('lazy-thumbnail');
  const repository = new MemoryAssetRepository();
  repository.record = createRecord({ libraryVisible: true, status: 'ready' });
  const gets: string[] = [];
  const puts: string[] = [];

  const content = await getAssetContent('user-1', assetId, {
    repository,
    createId: () => thumbnailId,
    createThumbnail: async (bytes) => {
      assert.deepEqual(Buffer.from(bytes), onePixelPng);
      return createThumbnailImage(thumbnailBytes);
    },
    objectStore: createObjectStore({
      get: async ({ key }) => {
        gets.push(key);
        const bytes = key.endsWith('.thumbnail.webp') ? thumbnailBytes : onePixelPng;
        return { body: new Response(bytes).body! };
      },
      put: async ({ key }) => {
        puts.push(key);
      },
    }),
  }, 'thumbnail');

  const thumbnailKey = `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.thumbnail.webp`;
  assert.deepEqual(gets, [
    `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.png`,
    thumbnailKey,
  ]);
  assert.deepEqual(puts, [thumbnailKey]);
  assert.equal(repository.variants.length, 1);
  assert.equal(repository.variants[0]?.id, thumbnailId);
  assert.equal(content.contentType, 'image/webp');
  assert.equal(content.asset.thumbnailUrl, `/api/assets/${assetId}/content?variant=thumbnail`);
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

test('asset deletion removes every stored variant before the original object', async () => {
  const repository = new MemoryAssetRepository();
  repository.record = createRecord({ status: 'ready' });
  repository.variants = [
    createVariantRecord(),
    createVariantRecord({
      id: '01900000-0000-7000-8000-000000000010',
      purpose: 'preview',
      storageKey: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.preview.webp`,
    }),
  ];
  const deletedKeys: string[] = [];

  await deleteAsset('user-1', assetId, {
    repository,
    objectStore: createObjectStore({
      delete: async ({ key }) => {
        deletedKeys.push(key);
      },
    }),
  });

  assert.deepEqual(deletedKeys, [
    `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.thumbnail.webp`,
    `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.preview.webp`,
    `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.png`,
  ]);
  assert.equal(repository.record?.status, 'deleted');
});

test('document cleanup blocks on partial S3 failure and safely resumes on retry', async () => {
  const firstId = '01900000-0000-7000-8000-000000000004';
  const secondId = '01900000-0000-7000-8000-000000000005';
  const repository = new DocumentAssetRepository([
    createRecord({ id: firstId, status: 'ready', storageKey: `documents/${documentId}/${firstId}.png` }),
    createRecord({ id: secondId, status: 'failed', storageKey: `documents/${documentId}/${secondId}.png` }),
  ]);
  const deleteCalls: string[] = [];
  let failSecond = true;
  const dependencies = {
    repository,
    objectStore: createObjectStore({
      delete: async ({ key }) => {
        deleteCalls.push(key);
        if (key.includes(secondId) && failSecond) throw new Error('temporary S3 failure');
      },
    }),
  };

  await assert.rejects(
    cleanupDocumentAssets(documentId, dependencies),
    AssetStorageError,
  );
  assert.equal(repository.records.find((record) => record.id === firstId)?.status, 'deleted');
  assert.equal(repository.records.find((record) => record.id === secondId)?.status, 'failed');

  failSecond = false;
  const retried = await cleanupDocumentAssets(documentId, dependencies);
  assert.deepEqual(retried, { scanned: 1, deleted: 1, preserved: 0 });
  assert.deepEqual(deleteCalls.map((key) => key.split('/').at(-1)?.split('.')[0]), [firstId, secondId, secondId]);
  assert.equal(repository.records.every((record) => record.status === 'deleted'), true);
});

test('document cleanup preserves ready Library assets and removes only hidden or incomplete assets', async () => {
  const visibleId = '01900000-0000-7000-8000-000000000006';
  const hiddenId = '01900000-0000-7000-8000-000000000007';
  const failedId = '01900000-0000-7000-8000-000000000008';
  const repository = new DocumentAssetRepository([
    createRecord({
      id: visibleId,
      status: 'ready',
      libraryVisible: true,
      storageKey: `documents/${documentId}/${visibleId}.png`,
    }),
    createRecord({
      id: hiddenId,
      status: 'ready',
      libraryVisible: false,
      storageKey: `documents/${documentId}/${hiddenId}.png`,
    }),
    createRecord({
      id: failedId,
      status: 'failed',
      libraryVisible: true,
      storageKey: `documents/${documentId}/${failedId}.png`,
    }),
  ]);
  const deletedKeys: string[] = [];

  const result = await cleanupDocumentAssets(documentId, {
    repository,
    objectStore: createObjectStore({
      delete: async ({ key }) => {
        deletedKeys.push(key);
      },
    }),
  });

  assert.deepEqual(result, { scanned: 3, deleted: 2, preserved: 1 });
  assert.deepEqual(
    deletedKeys.map((key) => key.split('/').at(-1)),
    [`${hiddenId}.png`, `${failedId}.png`],
  );
  assert.equal(repository.records.find((record) => record.id === visibleId)?.status, 'ready');
  assert.equal(repository.records.find((record) => record.id === hiddenId)?.status, 'deleted');
  assert.equal(repository.records.find((record) => record.id === failedId)?.status, 'deleted');
});

class MemoryAssetRepository implements AssetRepository {
  cleanupCandidates: AssetRecord[] = [];
  lastLibraryInput: AssetLibraryFilters | undefined;
  libraryFacets: AssetLibraryFacets = createLibraryFacets();
  libraryListCalls = 0;
  libraryRecords: LibraryAssetRecord[] = [];
  record: AssetRecord | undefined;
  transitions: string[] = [];
  variants: AssetVariantRecord[] = [];

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

  async findVariant(assetIdToFind: string, purpose: AssetVariantRecord['purpose']) {
    return this.variants.find((variant) => (
      variant.assetId === assetIdToFind && variant.purpose === purpose
    ));
  }

  async listLibrary(input: AssetLibraryFilters) {
    this.lastLibraryInput = input;
    this.libraryListCalls += 1;
    const rows = input.cursor
      ? this.libraryRecords.filter((record) => (
        record.createdAt < input.cursor!.createdAt
        || (
          record.createdAt.getTime() === input.cursor!.createdAt.getTime()
          && record.id < input.cursor!.id
        )
      ))
      : this.libraryRecords;
    return rows.slice(0, input.limit);
  }

  async listLibraryFacets() {
    return this.libraryFacets;
  }

  async listByDocument(_documentId: string) {
    return this.record && this.record.status !== 'deleted' ? [this.record] : [];
  }

  async listVariants(assetIdToFind: string) {
    return this.variants.filter((variant) => variant.assetId === assetIdToFind);
  }

  async markLibraryVisible(assetIdToMark: string) {
    if (!this.record || this.record.id !== assetIdToMark || this.record.status !== 'ready') {
      return undefined;
    }
    this.record = { ...this.record, libraryVisible: true, updatedAt: new Date() };
    return this.record;
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

  async upsertVariant(input: AssetVariantInput) {
    const now = new Date();
    const existing = this.variants.find((variant) => (
      variant.assetId === input.assetId && variant.purpose === input.purpose
    ));
    const record: AssetVariantRecord = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.variants = [
      ...this.variants.filter((variant) => (
        variant.assetId !== input.assetId || variant.purpose !== input.purpose
      )),
      record,
    ];
    return record;
  }
}

class DocumentAssetRepository extends MemoryAssetRepository {
  records: AssetRecord[];

  constructor(records: AssetRecord[]) {
    super();
    this.records = records;
  }

  override async listByDocument(documentIdToFind: string) {
    return this.records.filter((record) => (
      record.documentId === documentIdToFind && record.status !== 'deleted'
    ));
  }

  override async markDeleted(assetIdToDelete: string, deletedAt: Date) {
    this.records = this.records.map((record) => record.id === assetIdToDelete
      ? { ...record, status: 'deleted', deletedAt, updatedAt: deletedAt }
      : record);
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
    mediaKind: 'image',
    origin: 'unknown',
    libraryVisible: false,
    provider: null,
    modelId: null,
    operation: null,
    metadata: null,
    generationJobId: null,
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
    health: async () => undefined,
    put: async () => undefined,
    ...overrides,
  };
}

function createThumbnailImage(bytes: Uint8Array) {
  return {
    byteSize: bytes.byteLength,
    bytes,
    checksumSha256: 'b'.repeat(64),
    contentType: 'image/webp' as const,
    height: 320,
    width: 560,
  };
}

function createVariantRecord(
  overrides: Partial<AssetVariantRecord> = {},
  timestamp = new Date('2026-07-17T00:00:00.000Z'),
): AssetVariantRecord {
  return {
    id: '01900000-0000-7000-8000-000000000009',
    assetId,
    purpose: 'thumbnail',
    bucket: 'private-assets',
    storageKey: `workspaces/${workspaceId}/documents/${documentId}/assets/${assetId}.thumbnail.webp`,
    contentType: 'image/webp',
    byteSize: Buffer.byteLength('thumbnail-webp'),
    width: 560,
    height: 320,
    checksumSha256: 'b'.repeat(64),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

async function uploadWithProvenance(
  provenance: Pick<
    Parameters<typeof uploadImageAsset>[0],
    'generationJobId' | 'libraryVisible' | 'modelId' | 'operation' | 'origin' | 'provider'
  >,
) {
  const repository = new MemoryAssetRepository();
  const result = await uploadImageAsset({
    bytes: onePixelPng,
    claimedContentType: 'image/png',
    documentId,
    maxBytes: 1024,
    originalName: 'result.png',
    userId: 'user-1',
    workspaceId,
    ...provenance,
  }, {
    repository,
    bucket: 'private-assets',
    createId: () => assetId,
    assertAccess: async () => undefined,
    objectStore: createObjectStore(),
  });
  return { repository, result };
}

function pickProvenance(record: AssetRecord | undefined) {
  assert.ok(record);
  return {
    generationJobId: record.generationJobId,
    libraryVisible: record.libraryVisible,
    modelId: record.modelId,
    operation: record.operation,
    origin: record.origin,
    provider: record.provider,
  };
}

function createLibraryRecord(overrides: Partial<LibraryAssetRecord> = {}): LibraryAssetRecord {
  return {
    ...createRecord({
      status: 'ready',
      libraryVisible: true,
    }),
    documentName: 'Campaign document',
    documentStatus: 'active',
    thumbnailVariantId: null,
    ...overrides,
  };
}

function createLibraryFacets(): AssetLibraryFacets {
  return {
    documents: [{ count: 3, id: documentId, name: 'Campaign document', status: 'active' }],
    mediaKinds: [
      { count: 2, value: 'image' },
      { count: 1, value: 'video' },
    ],
    models: [{ count: 1, modelId: 'model-a', provider: 'openrouter' }],
    origins: [
      { count: 1, value: 'generated' },
      { count: 1, value: 'saved' },
      { count: 1, value: 'uploaded' },
    ],
    providers: [{ count: 1, value: 'openrouter' }],
  };
}
